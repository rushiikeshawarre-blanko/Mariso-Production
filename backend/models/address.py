from typing import Optional

from pydantic import BaseModel, Field

class AddressCreate(BaseModel):
    name: str
    phone: str
    address: str
    address_line_2: Optional[str] = None
    city: str
    state: str = Field(..., min_length=1)
    country: str = Field("India", min_length=1)
    postal_code: str
    is_default: bool = False
