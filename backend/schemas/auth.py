"""Auth request/response bodies."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    # 8 is the floor, not the goal. Length beats character-class rules; a long
    # passphrase is stronger than "P@ss1!" and users actually remember it.
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(default="", max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    display_name: str

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    """The refresh token is NOT in this body — it goes out as an httpOnly
    cookie so JavaScript can never read it."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: UserOut
