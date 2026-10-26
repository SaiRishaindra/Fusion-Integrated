from drf_spectacular.utils import extend_schema_serializer
from rest_framework import serializers

from modules.elm.models import Holiday, LeaveApplication, LeaveBalance, LeaveCategory, LeaveEvent


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveCategory
        fields = ("id", "code", "label", "description", "annual_entitlement",
                  "requires_substitute")
        read_only_fields = fields


class BalanceSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    available = serializers.DecimalField(max_digits=6, decimal_places=2,
                                         read_only=True)

    class Meta:
        model = LeaveBalance
        fields = ("id", "category", "leave_year", "opening", "credited", "used",
                  "pending", "available")
        read_only_fields = fields


@extend_schema_serializer(component_name="ElmApplication")
class ApplicationSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    day_count = serializers.DecimalField(max_digits=6, decimal_places=2,
                                         read_only=True)

    class Meta:
        model = LeaveApplication
        fields = ("id", "category", "start_date", "end_date", "half_day", "reason",
                  "status", "current_stage", "substitute_user_id", "submitted_at",
                  "decision_note", "day_count", "half_day_period")
        read_only_fields = fields


class ApplicationCreateSerializer(serializers.Serializer):
    category_code = serializers.CharField(max_length=24)
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    half_day = serializers.BooleanField(required=False, default=False)
    half_day_period = serializers.ChoiceField(
        choices=("first", "second", ""), required=False, default="")
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    substitute_user_id = serializers.IntegerField(
        required=False, allow_null=True, min_value=1)

    def validate(self, attrs):
        if attrs["end_date"] < attrs["start_date"]:
            raise serializers.ValidationError("end_date must not be before start_date")
        if attrs["half_day"] and attrs["start_date"] != attrs["end_date"]:
            raise serializers.ValidationError("A half-day request uses one date")
        if attrs["half_day"] and not attrs["half_day_period"]:
            raise serializers.ValidationError({"half_day_period": "Choose first or second half."})
        if not attrs["half_day"] and attrs["half_day_period"]:
            raise serializers.ValidationError({"half_day_period": "Only valid for half-day leave."})
        return attrs


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = ("id", "date", "name", "kind", "is_restricted")
        read_only_fields = fields


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveEvent
        fields = ("id", "action", "from_status", "to_status", "created_at")
        read_only_fields = fields


class CalendarFilterSerializer(serializers.Serializer):
    year = serializers.IntegerField(min_value=1900, max_value=9999, required=False)
