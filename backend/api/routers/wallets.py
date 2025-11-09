import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from api.deps import SessionDep
from crud import wallets as crud_wallets
from schemas.wallets import (
    WalletResponse,
    WalletTransactionResponse,
    WalletWithTransactionsResponse
)

router = APIRouter(prefix="/wallets", tags=["wallets"])


@router.get("/users/{user_id}", response_model=WalletResponse)
def get_user_wallet(user_id: uuid.UUID, db: SessionDep):
    """Get wallet for a user. Creates wallet if it doesn't exist."""
    wallet = crud_wallets.get_or_create_wallet(db, user_id)
    return wallet


@router.get("/users/{user_id}/with-transactions", response_model=WalletWithTransactionsResponse)
def get_user_wallet_with_transactions(
    user_id: uuid.UUID,
    limit: Optional[int] = Query(None, description="Limit number of transactions"),
    db: SessionDep = None
):
    """Get wallet with recent transactions for a user."""
    wallet = crud_wallets.get_wallet_with_transactions(db, user_id, limit=limit)
    if not wallet:
        wallet = crud_wallets.get_or_create_wallet(db, user_id)
    return wallet


@router.get("/{wallet_id}", response_model=WalletResponse)
def get_wallet(wallet_id: uuid.UUID, db: SessionDep):
    """Get wallet by ID."""
    wallet = crud_wallets.get_wallet_by_id(db, wallet_id)
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet


@router.get("/{wallet_id}/transactions", response_model=list[WalletTransactionResponse])
def get_wallet_transactions(
    wallet_id: uuid.UUID,
    limit: Optional[int] = Query(None, description="Limit number of transactions"),
    db: SessionDep = None
):
    """Get transactions for a wallet."""
    transactions = crud_wallets.get_wallet_transactions(
        db, wallet_id=wallet_id, limit=limit
    )
    return transactions


@router.get("/users/{user_id}/transactions", response_model=list[WalletTransactionResponse])
def get_user_transactions(
    user_id: uuid.UUID,
    limit: Optional[int] = Query(None, description="Limit number of transactions"),
    db: SessionDep = None
):
    """Get transactions for a user's wallet."""
    transactions = crud_wallets.get_wallet_transactions(
        db, user_id=user_id, limit=limit
    )
    return transactions

