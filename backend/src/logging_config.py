import contextvars
import json
import logging
import logging.config
from datetime import datetime, timezone
from typing import Any

request_id_context: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

_SAFE_EXTRA_FIELDS = {
    "action",
    "attempt",
    "deleted_count",
    "duration_ms",
    "error_type",
    "event",
    "method",
    "missing_count",
    "path",
    "provider",
    "receipt_count",
    "section_count",
    "status_code",
}


class JsonFormatter(logging.Formatter):
    """Serialize only explicitly allow-listed operational fields."""

    def format(self, record: logging.LogRecord) -> str:
        document: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_context.get(),
        }
        for field in _SAFE_EXTRA_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                document[field] = value
        if record.exc_info:
            document["exception_type"] = record.exc_info[0].__name__
        return json.dumps(document, ensure_ascii=False, separators=(",", ":"))


def configure_logging(level: str = "INFO") -> None:
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {"json": {"()": JsonFormatter}},
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "formatter": "json",
                    "stream": "ext://sys.stdout",
                }
            },
            "root": {"handlers": ["default"], "level": level},
            "loggers": {
                "uvicorn": {"handlers": ["default"], "level": level, "propagate": False},
                "uvicorn.error": {
                    "handlers": ["default"],
                    "level": level,
                    "propagate": False,
                },
                "uvicorn.access": {
                    "handlers": ["default"],
                    "level": level,
                    "propagate": False,
                },
            },
        }
    )
