"""Submission validation and terminal withdrawal (BR-EL-010/012/022/034)."""
from django.db import transaction
from django.shortcuts import get_object_or_404

from core.api.exceptions import BadRequestError, ConflictError
from modules.elm.models import ApplicantLock, LeaveApplication, LeaveCategory, LeaveEvent


@transaction.atomic
def submit(*, actor_id, data):
    # Lock the applicant rather than just the category: overlaps cross categories.
    ApplicantLock.objects.get_or_create(user_id=actor_id)
    ApplicantLock.objects.select_for_update().get(user_id=actor_id)
    values = dict(data)
    category = get_object_or_404(
        LeaveCategory, code=values.pop("category_code"), active=True)
    if values["half_day"] and category.code.upper() != "CL":
        raise BadRequestError("Half-day requests are only supported for CL.",
                              code="invalid_half_day")
    if values.get("substitute_user_id") == actor_id:
        raise BadRequestError("You cannot nominate yourself as substitute.",
                              code="invalid_substitute")
    overlapping = LeaveApplication.objects.filter(
        user_id=actor_id, status__in=["pending", "approved"],
        start_date__lte=values["end_date"], end_date__gte=values["start_date"]
    ).select_related("category")
    for existing in overlapping:
        opposite_halves = (
            values["half_day"] and existing.half_day
            and category.code.upper() == existing.category.code.upper() == "CL"
            and existing.start_date == existing.end_date == values["start_date"]
            and values["start_date"] == values["end_date"]
            and existing.half_day_period in {"first", "second"}
            and existing.half_day_period != values["half_day_period"])
        if not opposite_halves:
            raise ConflictError("The dates overlap an active leave application.",
                                code="leave_overlap")
    application = LeaveApplication.objects.create(
        user_id=actor_id, category=category, **values)
    LeaveEvent.objects.create(application=application, actor_user_id=actor_id,
                               action="submitted", to_status=application.status)
    return application


@transaction.atomic
def withdraw(*, actor_id, application_id):
    application = get_object_or_404(
        LeaveApplication.objects.select_for_update(), pk=application_id, user_id=actor_id)
    if application.status == "withdrawn":
        return application
    if application.status != "pending":
        raise ConflictError("Only pending applications can be withdrawn.",
                            code="withdrawal_unavailable")
    application.status = "withdrawn"
    application.current_stage = "employee"
    application.save(update_fields=["status", "current_stage", "updated_at"])
    LeaveEvent.objects.create(application=application, actor_user_id=actor_id,
                               action="withdrawn", from_status="pending", to_status="withdrawn")
    return application
