"""Regression tests for the public /api/v1/contexts endpoint.

This endpoint is intentionally unauthenticated so the embeddable widget works for
anonymous end users. These tests pin the safety properties that must hold anyway:

  - deactivated agents must never serve context anonymously
  - a deactivated agent must be indistinguishable from one that never existed
    (no existence oracle for enumerating other tenants' agent IDs)
  - active agents must keep working, i.e. the widget is not broken by the fix

Tenant isolation itself is enforced downstream in KbRetrievalService.retrieve(),
which resolves the agent's bound knowledge base and filters Qdrant by both kb_id
and the KB's tenant_id. These tests cover the endpoint-level gate.
"""

import database
import pytest
from sqlalchemy import select

from models import Agent


async def _set_active(agent_id: str, value: bool) -> None:
    # Access via the module, not a direct import: the test harness rebinds
    # database.AsyncSessionLocal in setup_test_db via configure_database().
    async with database.AsyncSessionLocal() as session:
        agent = (
            await session.execute(select(Agent).where(Agent.id == agent_id))
        ).scalar_one()
        agent.is_active = value
        session.add(agent)
        await session.commit()


async def _post_contexts(client, agent_id: str):
    return await client.post(
        "/api/v1/contexts", json={"agent_id": agent_id, "query": "test"}
    )


@pytest.mark.asyncio
async def test_contexts_rejects_inactive_agent(public_client, default_agent_id):
    """A deactivated agent must not serve context to anonymous callers."""
    await _set_active(default_agent_id, False)
    try:
        response = await _post_contexts(public_client, default_agent_id)
        assert response.status_code == 404
    finally:
        await _set_active(default_agent_id, True)


@pytest.mark.asyncio
async def test_contexts_gives_no_existence_oracle(public_client, default_agent_id):
    """Hidden and unknown agents must be indistinguishable.

    A differing status code or error body between "exists but deactivated" and
    "does not exist at all" would let anyone enumerate valid agent IDs across
    every tenant on the deployment.
    """
    await _set_active(default_agent_id, False)
    try:
        hidden = await _post_contexts(public_client, default_agent_id)
        unknown = await _post_contexts(public_client, "agt_does_not_exist_000")
        assert hidden.status_code == unknown.status_code == 404
        assert hidden.json() == unknown.json()
    finally:
        await _set_active(default_agent_id, True)


@pytest.mark.asyncio
async def test_contexts_still_serves_active_agent(public_client, default_agent_id):
    """The embeddable widget depends on this staying public for active agents."""
    response = await _post_contexts(public_client, default_agent_id)
    assert response.status_code == 200
    assert "contexts" in response.json()