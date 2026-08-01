from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_throttle import RateLimiter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import Device, User
from ..schemas import DeviceResponse, RegisterDeviceRequest, StatusResponse
from src.utils import with_rate_limit

router = APIRouter(tags=["Devices"])
get = with_rate_limit(router.get, RateLimiter(100, 1))
post = with_rate_limit(router.post, RateLimiter(100, 1))
delete = with_rate_limit(router.delete, RateLimiter(50, 1))

@get("/devices", response_model=list[DeviceResponse])
async def list_devices(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Device)
        .where(Device.user_id == user.id)
        .order_by(Device.created_at.desc())
    )
    devices = result.scalars().all()
    return [
        DeviceResponse(
            id=d.id,
            deviceId=d.device_id,
            model=d.model,
            os=d.os,
            createdAt=d.created_at,
        )
        for d in devices
    ]


@post(
    "/devices/register",
    status_code=status.HTTP_201_CREATED,
    response_model=StatusResponse,
)
async def register_device(
    body: RegisterDeviceRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device = Device(
        device_id=body.deviceId,
        model=body.model,
        os=body.os,
        user_id=user.id,
    )
    db.add(device)
    await db.commit()
    return {"status": "ok"}


@delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_device(
    device_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Device).where(Device.id == device_id, Device.user_id == user.id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Device not found"
        )
    await db.delete(device)
    await db.commit()
