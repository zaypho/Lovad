"""Idempotent seed script: demo language partners + moments.

Run: python /app/backend/seed.py
All demo accounts use password: Demo1234!
"""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from auth_utils import hash_password
from db import comments_col, moments_col, users_col

PASSWORD = "Demo1234!"

DEMO_INTERESTS = [
    "Movies",
    "Music",
    "Travel",
    "Food",
    "Photography",
    "Yoga",
    "Fitness",
    "Gaming",
    "Reading",
    "Art",
    "Football",
    "Coffee",
]

DEMO_USERS = [
    {
        "email": "mei@demo.com",
        "name": "Mei Lin",
        "country": "China",
        "native_language": "zh",
        "learning_language": "en",
        "teach_languages": [],
        "learning_languages": ["en", "ja"],
        "proficiency": "Intermediate",
        "bio": "Hi! I'm a designer from Shanghai. I love coffee and want to practice English for travel. 我可以帮你学中文!",
        "avatar_url": "https://i.pravatar.cc/150?img=44",
    },
    {
        "email": "diego@demo.com",
        "name": "Diego Ramírez",
        "country": "Mexico",
        "native_language": "es",
        "learning_language": "en",
        "proficiency": "Beginner",
        "bio": "Hola! Engineer from CDMX. Learning English for work — happy to teach you Spanish slang.",
        "avatar_url": "https://i.pravatar.cc/150?img=12",
    },
    {
        "email": "yuki@demo.com",
        "name": "Yuki Tanaka",
        "country": "Japan",
        "native_language": "ja",
        "learning_language": "en",
        "proficiency": "Advanced",
        "bio": "Tokyo-based photographer. I can help with Japanese, looking to polish my English writing.",
        "avatar_url": "https://i.pravatar.cc/150?img=47",
    },
    {
        "email": "amelie@demo.com",
        "name": "Amélie Laurent",
        "country": "France",
        "native_language": "fr",
        "learning_language": "es",
        "teach_languages": ["en"],
        "learning_languages": ["es"],
        "proficiency": "Intermediate",
        "bio": "Bonjour! Parisian baker learning Spanish for my move to Barcelona. Je peux t'aider en français!",
        "avatar_url": "https://i.pravatar.cc/150?img=31",
    },
    {
        "email": "lucas@demo.com",
        "name": "Lucas Oliveira",
        "country": "Brazil",
        "native_language": "pt",
        "learning_language": "en",
        "proficiency": "Intermediate",
        "bio": "Futebol fan from São Paulo 🇧🇷 Let's exchange Portuguese for English!",
        "avatar_url": "https://i.pravatar.cc/150?img=53",
    },
    {
        "email": "hana@demo.com",
        "name": "Hana Kim",
        "country": "South Korea",
        "native_language": "ko",
        "learning_language": "en",
        "proficiency": "Beginner",
        "bio": "Annyeong! K-drama scriptwriter. I'll teach you natural Korean expressions.",
        "avatar_url": "https://i.pravatar.cc/150?img=25",
    },
    {
        "email": "emma@demo.com",
        "name": "Emma Wilson",
        "country": "United Kingdom",
        "native_language": "en",
        "learning_language": "ja",
        "teach_languages": [],
        "learning_languages": ["ja", "ko"],
        "proficiency": "Beginner",
        "bio": "London teacher obsessed with Japan. Happy to help with British English & idioms!",
        "avatar_url": "https://i.pravatar.cc/150?img=16",
    },
    {
        "email": "luca@demo.com",
        "name": "Luca Bianchi",
        "country": "Italy",
        "native_language": "it",
        "learning_language": "en",
        "proficiency": "Intermediate",
        "bio": "Chef from Rome. I'll trade Italian lessons for English conversation (and recipes).",
        "avatar_url": "https://i.pravatar.cc/150?img=59",
    },
    {
        "email": "demo@demo.com",
        "name": "Demo User",
        "country": "United States",
        "native_language": "en",
        "learning_language": "es",
        "teach_languages": [],
        "learning_languages": ["es", "fr", "zh"],
        "gender": "male",
        "is_vip": True,
        "proficiency": "Beginner",
        "bio": "Just here exploring LinguaConnect!",
        "avatar_url": "https://i.pravatar.cc/150?img=68",
    },
]

MOMENTS = [
    ("mei@demo.com", "Today I learned the phrase 'piece of cake' 🍰 — it means something is easy! English idioms are so fun. What's your favorite idiom?"),
    ("diego@demo.com", "Question for native English speakers: when do you use 'do' vs 'make'? I always confuse 'make homework' and 'do homework' 😅"),
    ("yuki@demo.com", "Watched a movie without subtitles for the first time and understood 80%! Small wins. 頑張ります!"),
    ("amelie@demo.com", "Fun fact: in French we say 'avoir le cafard' (to have the cockroach) when we feel sad. What strange expressions exist in your language?"),
    ("emma@demo.com", "Day 30 of learning Japanese! Hiragana ✅ Katakana ✅ Now facing the kanji mountain... any tips? 🗻"),
    ("lucas@demo.com", "If anyone wants to practice Portuguese, the World Cup season is the BEST time. Vamos! ⚽"),
]


async def seed():
    now = datetime.now(timezone.utc)
    pw_hash = hash_password(PASSWORD)
    email_to_id = {}
    created_users = 0
    for i, u in enumerate(DEMO_USERS):
        u.setdefault("teach_languages", [])
        u.setdefault("learning_languages", [u["learning_language"]])
        u.setdefault("age", 21 + (i * 2) % 15)
        u.setdefault("gender", "female" if i % 2 else "male")
        u.setdefault("is_vip", i % 3 == 0)
        u.setdefault(
            "interests",
            [DEMO_INTERESTS[(i + j) % len(DEMO_INTERESTS)] for j in range(4)],
        )
        existing = await users_col.find_one({"email": u["email"]})
        if existing:
            email_to_id[u["email"]] = existing["_id"]
            lang_updates = {}
            if "learning_languages" not in existing:
                lang_updates["learning_languages"] = u["learning_languages"]
            if "teach_languages" not in existing:
                lang_updates["teach_languages"] = u["teach_languages"]
            if "age" not in existing:
                lang_updates["age"] = u["age"]
            if "interests" not in existing:
                lang_updates["interests"] = u["interests"]
            if "gender" not in existing:
                lang_updates["gender"] = u["gender"]
            if "is_vip" not in existing:
                lang_updates["is_vip"] = u["is_vip"]
            if lang_updates:
                await users_col.update_one(
                    {"_id": existing["_id"]}, {"$set": lang_updates}
                )
            continue
        user_id = str(uuid.uuid4())
        await users_col.insert_one(
            {
                "_id": user_id,
                "password_hash": pw_hash,
                "created_at": (now - timedelta(days=30 - i)).isoformat(),
                **u,
            }
        )
        email_to_id[u["email"]] = user_id
        created_users += 1

    created_moments = 0
    for i, (email, text) in enumerate(MOMENTS):
        existing = await moments_col.find_one({"text": text})
        if existing:
            continue
        likers = [v for k, v in email_to_id.items() if k != email][: (i % 4) + 1]
        await moments_col.insert_one(
            {
                "_id": str(uuid.uuid4()),
                "user_id": email_to_id[email],
                "text": text,
                "likes": likers,
                "comment_count": 0,
                "created_at": (now - timedelta(hours=4 * (len(MOMENTS) - i))).isoformat(),
            }
        )
        created_moments += 1

    print(f"Seed complete: {created_users} users, {created_moments} moments created.")


if __name__ == "__main__":
    asyncio.run(seed())
