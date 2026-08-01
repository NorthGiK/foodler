__all__ = [
    "ROUTERS",
]

from .ai import router as ai_router
from .auth import router as auth_router
from .devices import router as device_router
from .knowledge import router as knowledge_router
from .receipts import router as receipt_router
from .subscription import router as subscription_router
from .users import router as users_router

ROUTERS = [
    ai_router,
    auth_router,
    device_router,
    knowledge_router,
    receipt_router,
    subscription_router,
    users_router,
]
