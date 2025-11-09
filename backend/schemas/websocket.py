from typing import Optional, Literal
from pydantic import BaseModel
import uuid


# WebSocket Message Types
class WSMessage(BaseModel):
    type: str
    payload: dict


# Incoming messages
class JoinSessionMessage(BaseModel):
    type: Literal["join_session"] = "join_session"
    user_id: uuid.UUID


class AssignItemMessage(BaseModel):
    type: Literal["assign_item"] = "assign_item"
    order_item_id: uuid.UUID
    creditor_id: uuid.UUID  # Participant who will pay
    debtor_id: Optional[uuid.UUID] = None  # Participant who owes (if different)
    assigned_amount: int  # Amount in centavos


class GetSelectableParticipantsMessage(BaseModel):
    type: Literal["get_selectable_participants"] = "get_selectable_participants"
    order_item_id: uuid.UUID
    user_id: uuid.UUID

class GetPayingForParticipantsMessage(BaseModel):
    type: Literal["get_paying_for_participants"] = "get_paying_for_participants"
    order_item_id: uuid.UUID
    user_id: uuid.UUID

class RemoveAssignmentMessage(BaseModel):
    type: Literal["remove_assignment"] = "remove_assignment"
    assignment_id: uuid.UUID


class CalculateEqualSplitMessage(BaseModel):
    type: Literal["calculate_equal_split"] = "calculate_equal_split"


class RequestSummaryMessage(BaseModel):
    type: Literal["request_summary"] = "request_summary"


class ValidateAssignmentsMessage(BaseModel):
    type: Literal["validate_assignments"] = "validate_assignments"


class FinalizeSessionMessage(BaseModel):
    type: Literal["finalize_session"] = "finalize_session"


class UnlockSessionMessage(BaseModel):
    type: Literal["unlock_session"] = "unlock_session"


# Outgoing messages
class ParticipantJoinedMessage(BaseModel):
    type: Literal["participant_joined"] = "participant_joined"
    participant_id: uuid.UUID
    user_id: Optional[uuid.UUID]
    joined_at: str


class ParticipantLeftMessage(BaseModel):
    type: Literal["participant_left"] = "participant_left"
    participant_id: uuid.UUID


class ItemAssignedMessage(BaseModel):
    type: Literal["item_assigned"] = "item_assigned"
    assignment_id: uuid.UUID
    order_item_id: uuid.UUID
    creditor_id: uuid.UUID
    debtor_id: Optional[uuid.UUID]
    assigned_amount: int


class SelectableParticipantsMessage(BaseModel):
    type: Literal["selectable_participants"] = "selectable_participants"
    order_item_id: uuid.UUID
    selectable_participants: list[str]

class PayingForParticipantsMessage(BaseModel):
    type: Literal["paying_for_participants"] = "paying_for_participants"
    order_item_id: uuid.UUID
    paying_for_participants: list[str]  # List of user_ids that the current user is paying for

class AssignmentUpdatedMessage(BaseModel):
    type: Literal["assignment_updated"] = "assignment_updated"
    assignment_id: uuid.UUID
    assigned_amount: int


class AssignmentRemovedMessage(BaseModel):
    type: Literal["assignment_removed"] = "assignment_removed"
    assignment_id: uuid.UUID


class EqualSplitCalculatedMessage(BaseModel):
    type: Literal["equal_split_calculated"] = "equal_split_calculated"
    total_amount: int
    participant_count: int
    amount_per_person: int


class SummaryUpdatedMessage(BaseModel):
    type: Literal["summary_updated"] = "summary_updated"
    summary: dict  # {participant_id: total_amount}


class AssignmentsValidatedMessage(BaseModel):
    type: Literal["assignments_validated"] = "assignments_validated"
    all_assigned: bool
    unassigned_items: list[uuid.UUID]


class SessionFinalizedMessage(BaseModel):
    type: Literal["session_finalized"] = "session_finalized"
    session_id: uuid.UUID
    total_amount: int
    ready_for_invoices: bool


class SessionStateMessage(BaseModel):
    type: Literal["session_state"] = "session_state"
    session: dict
    participants: list[dict]
    order_items: list[dict]
    assignments: list[dict]


class SessionLockedMessage(BaseModel):
    type: Literal["session_locked"] = "session_locked"
    locked_by_user_id: uuid.UUID


class SessionUnlockedMessage(BaseModel):
    type: Literal["session_unlocked"] = "session_unlocked"

