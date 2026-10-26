from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from conftest import make_session
from modules.elm.models import Holiday, LeaveApplication, LeaveBalance, LeaveCategory, LeaveEvent
from modules.elm.registry import ROLE_GRANTS

pytestmark = pytest.mark.django_db
PREFIX = "/api/v1/leave"
PERMS = ["employee_leave.application.view_self", "employee_leave.application.create",
         "employee_leave.application.withdraw", "employee_leave.balance.view",
         "employee_leave.calendar.view"]


@pytest.fixture
def category():
    return LeaveCategory.objects.create(code="CL", label="Casual Leave")


@pytest.fixture
def client_for(stub_iam):
    def client(permissions=PERMS, uid=101, modules=("employee_leave",)):
        stub_iam(make_session(user_id=uid, kind="staff", permissions=permissions,
                              modules=modules, roles=("staff",), active_role="staff"))
        result = APIClient()
        result.credentials(HTTP_AUTHORIZATION="Token test-elm")
        return result
    return client


def payload(**overrides):
    return {"category_code": "CL", "start_date": "2026-11-02", "end_date": "2026-11-02",
            "reason": "Personal work", **overrides}


def submit(client, **overrides):
    return client.post(f"{PREFIX}/applications", payload(**overrides), format="json")


def application(category, **overrides):
    return LeaveApplication.objects.create(
        **{"category": category, "user_id": 101, "start_date": date(2026, 11, 2),
           "end_date": date(2026, 11, 2), **overrides})


def test_create_permission_cannot_be_replaced_by_view_permission(client_for, category):
    response = submit(client_for([PERMS[0]]))
    assert response.status_code == 403
    assert not LeaveApplication.objects.exists()


def test_create_without_view_permission_is_allowed(client_for, category):
    assert submit(client_for([PERMS[1]])).status_code == 201


def test_create_uses_authenticated_owner_and_records_history(client_for, category):
    response = submit(client_for(), user_id=999)
    assert response.status_code == 201
    row = LeaveApplication.objects.get()
    assert row.user_id == 101
    assert row.events.get().action == "submitted"
    assert row.day_count == Decimal("1")


def test_missing_module_grant_blocks_access(client_for, category):
    assert submit(client_for(modules=())).status_code == 403


@pytest.mark.parametrize("fields", [
    {"end_date": "2026-11-01"},
    {"half_day": True},
    {"half_day": True, "half_day_period": "first", "end_date": "2026-11-03"},
    {"half_day_period": "second"},
    {"half_day": True, "half_day_period": "invalid"},
    {"substitute_user_id": 0},
    {"start_date": "bad-date"},
])
def test_invalid_input_never_creates_application(client_for, category, fields):
    assert submit(client_for(), **fields).status_code == 400
    assert not LeaveApplication.objects.exists()
    assert not LeaveEvent.objects.exists()


@pytest.mark.parametrize("fields", [{"category_code": "UNKNOWN"}, {"category_code": "EL"}])
def test_unknown_or_inactive_category_is_not_server_error(client_for, category, fields):
    LeaveCategory.objects.create(code="EL", label="Earned Leave", active=False)
    assert submit(client_for(), **fields).status_code == 404


def test_half_day_only_for_casual_leave(client_for, category):
    LeaveCategory.objects.create(code="EL", label="Earned Leave")
    response = submit(client_for(), category_code="EL", half_day=True, half_day_period="first")
    assert response.status_code == 400


def test_self_substitution_rejected(client_for, category):
    assert submit(client_for(), substitute_user_id=101).status_code == 400


@pytest.mark.parametrize("status", ["pending", "approved"])
def test_active_overlap_across_categories_is_rejected(client_for, category, status):
    application(category, status=status)
    LeaveCategory.objects.create(code="EL", label="Earned Leave")
    assert submit(client_for(), category_code="EL").status_code == 409
    assert LeaveApplication.objects.count() == 1


@pytest.mark.parametrize("status", ["rejected", "withdrawn"])
def test_inactive_application_does_not_block_resubmission(client_for, category, status):
    application(category, status=status)
    assert submit(client_for()).status_code == 201


def test_different_employee_does_not_block_application(client_for, category):
    application(category, user_id=202)
    assert submit(client_for()).status_code == 201


def test_different_cl_halves_are_allowed(client_for, category):
    application(category, half_day=True, half_day_period="first")
    response = submit(client_for(), half_day=True, half_day_period="second")
    assert response.status_code == 201
    assert response.data["day_count"] == "0.50"


def test_same_half_is_rejected(client_for, category):
    application(category, half_day=True, half_day_period="first")
    assert submit(client_for(), half_day=True, half_day_period="first").status_code == 409


def test_legacy_half_day_without_period_is_not_assumed_to_be_opposite(client_for, category):
    application(category, half_day=True)
    assert submit(client_for(), half_day=True, half_day_period="second").status_code == 409


def test_full_day_overlaps_half_day(client_for, category):
    application(category, half_day=True, half_day_period="first")
    assert submit(client_for()).status_code == 409


def test_overlap_includes_both_boundary_dates(client_for, category):
    application(category, end_date=date(2026, 11, 4))
    assert submit(client_for(), start_date="2026-11-04", end_date="2026-11-05").status_code == 409
    assert submit(client_for(), start_date="2026-11-05", end_date="2026-11-05").status_code == 201


def test_pending_withdrawal_records_one_terminal_event(client_for, category):
    row = application(category)
    client = client_for()
    url = f"{PREFIX}/applications/{row.pk}/withdraw"
    assert client.post(url).status_code == 200
    assert client.post(url).status_code == 200
    row.refresh_from_db()
    assert row.status == "withdrawn"
    assert row.events.filter(action="withdrawn").count() == 1


@pytest.mark.parametrize("status", ["approved", "rejected"])
def test_finalized_application_cannot_be_withdrawn(client_for, category, status):
    row = application(category, status=status)
    assert client_for().post(f"{PREFIX}/applications/{row.pk}/withdraw").status_code == 409
    row.refresh_from_db()
    assert row.status == status
    assert row.events.count() == 0


def test_other_person_cannot_withdraw_or_read_history(client_for, category):
    row = application(category, user_id=202)
    client = client_for()
    assert client.post(f"{PREFIX}/applications/{row.pk}/withdraw").status_code == 404
    assert client.get(f"{PREFIX}/applications/{row.pk}/history").status_code == 404


def test_missing_withdraw_permission_is_denied(client_for, category):
    row = application(category)
    client = client_for([PERMS[0]])
    assert client.post(f"{PREFIX}/applications/{row.pk}/withdraw").status_code == 403


def test_own_history_is_returned_in_order(client_for, category):
    client = client_for()
    pk = submit(client).data["id"]
    client.post(f"{PREFIX}/applications/{pk}/withdraw")
    response = client.get(f"{PREFIX}/applications/{pk}/history")
    assert [e["action"] for e in response.data["results"]] == ["submitted", "withdrawn"]


def test_application_list_and_balances_are_scoped(client_for, category):
    own = application(category)
    application(category, user_id=202)
    for uid in [101, 202]:
        LeaveBalance.objects.create(user_id=uid, category=category, leave_year="2026",
                                    opening=10, used=2, pending=1)
    client = client_for()
    assert [r["id"] for r in client.get(f"{PREFIX}/applications").data["results"]] == [own.pk]
    balances = client.get(f"{PREFIX}/balances").data["results"]
    assert len(balances) == 1
    assert balances[0]["available"] == "7.00"


def test_submitted_requests_cannot_be_edited(client_for, category):
    row = application(category)
    client = client_for()
    assert client.patch(f"{PREFIX}/applications/{row.pk}/withdraw", {}).status_code == 405
    assert client.patch(f"{PREFIX}/applications", {}).status_code == 405
    row.refresh_from_db()
    assert row.status == "pending"


@pytest.mark.parametrize("year", ["abc", "0", "10000", "2026.5"])
def test_calendar_invalid_year_returns_validation_error(client_for, year):
    assert client_for().get(f"{PREFIX}/calendar", {"year": year}).status_code == 400


def test_calendar_filters_year_and_hides_unpublished_rows(client_for):
    Holiday.objects.create(date="2026-11-01", name="Published")
    Holiday.objects.create(date="2026-11-02", name="Draft", published=False)
    Holiday.objects.create(date="2027-11-01", name="Next year")
    response = client_for().get(f"{PREFIX}/calendar?year=2026")
    assert [r["name"] for r in response.data["results"]] == ["Published"]


def test_students_are_not_automatically_granted_employee_leave():
    assert "student" not in ROLE_GRANTS


@pytest.mark.django_db(transaction=True)
def test_simultaneous_submissions_cannot_both_claim_the_same_date(category):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from django.db import connections

    from core.api.exceptions import ConflictError
    from modules.elm import services
    from modules.elm.api.serializers import ApplicationCreateSerializer

    barrier = Barrier(2)

    def send():
        serializer = ApplicationCreateSerializer(data=payload())
        serializer.is_valid(raise_exception=True)
        try:
            barrier.wait(timeout=10)
            services.submit(actor_id=101, data=serializer.validated_data)
        except ConflictError:
            return "overlap"
        else:
            return "created"
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(send)
        second = pool.submit(send)
        assert sorted([first.result(timeout=20), second.result(timeout=20)]) == ["created", "overlap"]
    assert LeaveApplication.objects.count() == 1
    assert LeaveEvent.objects.count() == 1
