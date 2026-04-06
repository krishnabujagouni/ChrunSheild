"""PostgreSQL pool  same database as Prisma (apps/web)."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import socket
from urllib.parse import unquote

import asyncpg

from churnshield_agents.config import get_settings

_pool: asyncpg.Pool | None = None


def _parse_dsn(url: str) -> dict:
    """Parse a postgres URL using rightmost @ as user/host separator (like Prisma)."""
    url = url.replace("postgresql+asyncpg://", "postgresql://").replace("postgres+asyncpg://", "postgres://")
    # Strip scheme
    rest = url.split("://", 1)[1]
    # Remove query string
    if "?" in rest:
        rest, qs = rest.split("?", 1)
    else:
        qs = ""
    # Split on rightmost @ to handle @ in password
    at = rest.rfind("@")
    credentials = rest[:at]
    hostpart = rest[at + 1:]
    # credentials = user:password
    colon = credentials.find(":")
    user = unquote(credentials[:colon])
    password = unquote(credentials[colon + 1:])
    # hostpart = host:port/db
    slash = hostpart.find("/")
    hostport = hostpart[:slash]
    database = hostpart[slash + 1:]
    if ":" in hostport:
        host, port_str = hostport.rsplit(":", 1)
        port = int(port_str)
    else:
        host = hostport
        port = 5432
    return {"user": user, "password": password, "host": host, "port": port, "database": database}


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Return timezone-aware datetimes from asyncpg (UTC)."""
    await conn.execute("SET TIME ZONE 'UTC'")


async def connect() -> None:
    global _pool
    url = get_settings().database_url
    if not url:
        return
    dsn = _parse_dsn(url)
    # Force IPv4  asyncpg picks IPv6 first which times out on some networks
    all_addrs = socket.getaddrinfo(dsn["host"], dsn["port"])
    ipv4_addrs = [r[4][0] for r in all_addrs if r[0] == socket.AF_INET]
    ipv4 = ipv4_addrs[0] if ipv4_addrs else dsn["host"]
    _pool = await asyncpg.create_pool(
        host=ipv4,
        port=dsn["port"],
        user=dsn["user"],
        password=dsn["password"],
        database=dsn["database"],
        min_size=1,
        max_size=10,
        statement_cache_size=0,
        ssl="require",
        init=_init_connection,
    )


async def disconnect() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def pool() -> asyncpg.Pool:
    if _pool is None:
        msg = "Database not configured (set DATABASE_URL)"
        raise RuntimeError(msg)
    return _pool


async def tenant_id_for_stripe_account(stripe_connect_account_id: str | None) -> UUID | None:
    if not stripe_connect_account_id:
        return None
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            'SELECT id FROM tenants WHERE stripe_connect_id = $1',
            stripe_connect_account_id,
        )
        if row is None:
            return None
        return row['id']


async def get_all_tenant_ids() -> list[UUID]:
    async with pool().acquire() as conn:
        rows = await conn.fetch("SELECT id FROM tenants ORDER BY created_at")
        return [row["id"] for row in rows]


async def insert_stripe_event(
    *,
    tenant_id: UUID | None,
    stripe_event_id: str,
    type_name: str,
    payload: dict[str, Any],
    livemode: bool,
) -> UUID | None:
    """Insert webhook event. Returns new row id, or None if duplicate stripe_event_id."""
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO stripe_events (tenant_id, stripe_event_id, type, payload, livemode)
            VALUES ($1, $2, $3, $4::jsonb, $5)
            ON CONFLICT (stripe_event_id) DO NOTHING
            RETURNING id
            """,
            tenant_id,
            stripe_event_id,
            type_name,
            json.dumps(payload),
            livemode,
        )
        return None if row is None else row["id"]
