import redis.asyncio as aioredis
from .config import settings

redis_client: aioredis.Redis = None

async def get_redis() -> aioredis.Redis:
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return redis_client

async def set_user_online(user_id: int):
    r = await get_redis()
    await r.sadd("online_users", str(user_id))
    await r.expire("online_users", 86400)

async def set_user_offline(user_id: int):
    r = await get_redis()
    await r.srem("online_users", str(user_id))

async def get_online_users() -> list[int]:
    r = await get_redis()
    members = await r.smembers("online_users")
    return [int(m) for m in members]

async def publish_event(channel: str, message: str):
    r = await get_redis()
    await r.publish(channel, message)
