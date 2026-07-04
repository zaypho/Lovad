#!/usr/bin/env python3
"""
Backend test for Voice Room + Moments Share-to-Moments feature
Tests the new POST /api/rooms/{room_id}/share-to-moments endpoint
"""
import requests
import json

BASE_URL = "https://368bd428-054d-4ed0-be5c-b4aaf6dfeef5.preview.emergentagent.com/api"

# Test credentials
USER_A = {"email": "mei@demo.com", "password": "Demo1234!"}
USER_B = {"email": "diego@demo.com", "password": "Demo1234!"}

def login(email, password):
    """Login and return auth token"""
    resp = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    if resp.status_code != 200:
        print(f"❌ Login failed for {email}: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    return data.get("token")

def get_headers(token):
    """Get auth headers"""
    return {"Authorization": f"Bearer {token}"}

def print_step(step_num, description):
    """Print test step header"""
    print(f"\n{'='*80}")
    print(f"STEP {step_num}: {description}")
    print('='*80)

def main():
    print("🧪 VOICE ROOM SHARE-TO-MOMENTS FEATURE TEST")
    print("="*80)
    
    # Login both users
    print("\n📝 Logging in users...")
    token_a = login(USER_A["email"], USER_A["password"])
    token_b = login(USER_B["email"], USER_B["password"])
    
    if not token_a or not token_b:
        print("❌ Failed to login users. Aborting test.")
        return
    
    print(f"✅ User A (mei@demo.com) logged in")
    print(f"✅ User B (diego@demo.com) logged in")
    
    headers_a = get_headers(token_a)
    headers_b = get_headers(token_b)
    
    # Get user IDs
    resp_a = requests.get(f"{BASE_URL}/auth/me", headers=headers_a)
    resp_b = requests.get(f"{BASE_URL}/auth/me", headers=headers_b)
    user_a_id = resp_a.json()["id"]
    user_b_id = resp_b.json()["id"]
    print(f"User A ID: {user_a_id}")
    print(f"User B ID: {user_b_id}")
    
    # STEP 1: User A creates room WITHOUT share_to_moments
    print_step(1, "User A (mei) creates room WITHOUT share_to_moments")
    room_data = {
        "title": "Share Test Room",
        "language": "en",
        "languages": ["en"],
        "mode": "chat",
        "is_private": False,
        "share_to_moments": False
    }
    resp = requests.post(f"{BASE_URL}/rooms", json=room_data, headers=headers_a)
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code != 201:
        print(f"❌ FAILED: Expected 201, got {resp.status_code}")
        return
    
    room = resp.json()
    room_id = room["id"]
    print(f"✅ PASSED: Room created with ID: {room_id}")
    print(f"   Title: {room['title']}")
    print(f"   Mode: {room['mode']}")
    print(f"   Is Private: {room['is_private']}")
    
    # STEP 2: GET /api/moments as user A - confirm NO new moment
    print_step(2, "GET /api/moments as user A - confirm NO new moment for this room")
    resp = requests.get(f"{BASE_URL}/moments", headers=headers_a)
    print(f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        return
    
    moments = resp.json()
    initial_moment_count = len(moments)
    room_moments = [m for m in moments if m.get("room") and m["room"].get("id") == room_id]
    
    print(f"Total moments: {initial_moment_count}")
    print(f"Moments for room {room_id}: {len(room_moments)}")
    
    if len(room_moments) > 0:
        print(f"❌ FAILED: Expected 0 moments for this room (share_to_moments was false), found {len(room_moments)}")
        return
    
    print(f"✅ PASSED: No moment created for room (share_to_moments was false at creation)")
    
    # STEP 3: Host calls POST /api/rooms/{room_id}/share-to-moments
    print_step(3, "Host (user A) calls POST /api/rooms/{room_id}/share-to-moments")
    resp = requests.post(f"{BASE_URL}/rooms/{room_id}/share-to-moments", headers=headers_a)
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code != 201:
        print(f"❌ FAILED: Expected 201, got {resp.status_code}")
        return
    
    share_resp = resp.json()
    if share_resp.get("shared") != True:
        print(f"❌ FAILED: Expected {{shared: true}}, got {share_resp}")
        return
    
    print(f"✅ PASSED: Room shared to moments successfully")
    
    # STEP 4: GET /api/moments as user A - confirm NEW moment exists
    print_step(4, "GET /api/moments as user A - confirm NEW moment with room details")
    resp = requests.get(f"{BASE_URL}/moments", headers=headers_a)
    print(f"Status: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {resp.status_code}")
        return
    
    moments = resp.json()
    new_moment_count = len(moments)
    room_moments = [m for m in moments if m.get("room") and m["room"].get("id") == room_id]
    
    print(f"Total moments: {new_moment_count}")
    print(f"Moments for room {room_id}: {len(room_moments)}")
    
    if len(room_moments) != 1:
        print(f"❌ FAILED: Expected 1 moment for this room, found {len(room_moments)}")
        return
    
    moment = room_moments[0]
    print(f"\nMoment details:")
    print(f"  ID: {moment['id']}")
    print(f"  Text: {moment['text']}")
    print(f"  Room ID: {moment['room']['id']}")
    print(f"  Room is_live: {moment['room']['is_live']}")
    print(f"  Room title: {moment['room'].get('title')}")
    
    # Verify moment details
    if moment["room"]["id"] != room_id:
        print(f"❌ FAILED: Moment room.id ({moment['room']['id']}) != room_id ({room_id})")
        return
    
    if moment["room"]["is_live"] != True:
        print(f"❌ FAILED: Expected room.is_live=true, got {moment['room']['is_live']}")
        return
    
    if moment["room"].get("title") != "Share Test Room":
        print(f"❌ FAILED: Expected room.title='Share Test Room', got {moment['room'].get('title')}")
        return
    
    print(f"✅ PASSED: Moment created with correct room details (is_live=true, title='Share Test Room')")
    
    # STEP 5: Call share-to-moments AGAIN - should create SECOND moment
    print_step(5, "Call POST /api/rooms/{room_id}/share-to-moments AGAIN (repeatable sharing)")
    resp = requests.post(f"{BASE_URL}/rooms/{room_id}/share-to-moments", headers=headers_a)
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code != 201:
        print(f"❌ FAILED: Expected 201, got {resp.status_code}")
        return
    
    print(f"✅ PASSED: Second share succeeded (201)")
    
    # Verify 2 moments now exist
    resp = requests.get(f"{BASE_URL}/moments", headers=headers_a)
    moments = resp.json()
    room_moments = [m for m in moments if m.get("room") and m["room"].get("id") == room_id]
    
    print(f"Moments for room {room_id}: {len(room_moments)}")
    
    if len(room_moments) != 2:
        print(f"❌ FAILED: Expected 2 moments for this room (repeatable sharing), found {len(room_moments)}")
        return
    
    print(f"✅ PASSED: Second moment created - repeatable sharing works (2 moments total)")
    
    # STEP 6: User B (non-host) tries to share - should fail with 403
    print_step(6, "User B (diego, NOT host) tries POST /api/rooms/{room_id}/share-to-moments")
    resp = requests.post(f"{BASE_URL}/rooms/{room_id}/share-to-moments", headers=headers_b)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")
    
    if resp.status_code != 403:
        print(f"❌ FAILED: Expected 403 (only host can share), got {resp.status_code}")
        return
    
    resp_data = resp.json()
    if "only the host" not in resp_data.get("detail", "").lower():
        print(f"❌ FAILED: Expected 'only the host' error message, got: {resp_data.get('detail')}")
        return
    
    print(f"✅ PASSED: Non-host correctly rejected with 403 (only host can share)")
    
    # STEP 7: User B joins room and raises hand
    print_step(7, "User B joins room and raises hand")
    
    # Join room
    resp = requests.post(f"{BASE_URL}/rooms/{room_id}/join", headers=headers_b)
    print(f"Join status: {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: User B join failed with {resp.status_code}")
        return
    
    print(f"✅ User B joined room")
    
    # Raise hand
    resp = requests.post(f"{BASE_URL}/rooms/{room_id}/hand", headers=headers_b)
    print(f"Hand raise status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Hand raise failed with {resp.status_code}")
        return
    
    hand_resp = resp.json()
    if hand_resp.get("hand_raised") != True:
        print(f"❌ FAILED: Expected hand_raised=true, got {hand_resp}")
        return
    
    print(f"✅ User B raised hand")
    
    # Verify in room details
    resp = requests.get(f"{BASE_URL}/rooms/{room_id}", headers=headers_a)
    room = resp.json()
    
    print(f"\nRoom members:")
    user_b_member = None
    for member in room["members"]:
        print(f"  - {member.get('name')}: role={member['role']}, hand_raised={member['hand_raised']}")
        if member["id"] == user_b_id:
            user_b_member = member
    
    if not user_b_member:
        print(f"❌ FAILED: User B not found in room members")
        return
    
    if user_b_member["hand_raised"] != True:
        print(f"❌ FAILED: User B hand_raised should be true, got {user_b_member['hand_raised']}")
        return
    
    if user_b_member["role"] != "listener":
        print(f"❌ FAILED: User B role should be 'listener', got {user_b_member['role']}")
        return
    
    print(f"✅ PASSED: User B in room with hand_raised=true and role='listener'")
    
    # STEP 8: Host accepts - change role to speaker
    print_step(8, "Host accepts - change User B role to 'speaker'")
    
    role_data = {
        "user_id": user_b_id,
        "role": "speaker"
    }
    resp = requests.post(f"{BASE_URL}/rooms/{room_id}/role", json=role_data, headers=headers_a)
    print(f"Status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: Role change failed with {resp.status_code}")
        return
    
    print(f"✅ Role change request succeeded")
    
    # Verify role change and hand_raised reset
    resp = requests.get(f"{BASE_URL}/rooms/{room_id}", headers=headers_a)
    room = resp.json()
    
    print(f"\nRoom members after role change:")
    user_b_member = None
    for member in room["members"]:
        print(f"  - {member.get('name')}: role={member['role']}, hand_raised={member['hand_raised']}")
        if member["id"] == user_b_id:
            user_b_member = member
    
    if not user_b_member:
        print(f"❌ FAILED: User B not found in room members")
        return
    
    if user_b_member["role"] != "speaker":
        print(f"❌ FAILED: User B role should be 'speaker', got {user_b_member['role']}")
        return
    
    if user_b_member["hand_raised"] != False:
        print(f"❌ FAILED: User B hand_raised should reset to false, got {user_b_member['hand_raised']}")
        return
    
    print(f"✅ PASSED: User B role='speaker' and hand_raised reset to false")
    
    # STEP 9: End room and verify moments show is_live=false
    print_step(9, "End room and verify moments show is_live=false")
    
    resp = requests.post(f"{BASE_URL}/rooms/{room_id}/end", headers=headers_a)
    print(f"End room status: {resp.status_code}")
    print(f"Response: {json.dumps(resp.json(), indent=2)}")
    
    if resp.status_code != 200:
        print(f"❌ FAILED: End room failed with {resp.status_code}")
        return
    
    print(f"✅ Room ended successfully")
    
    # Verify moments show is_live=false
    resp = requests.get(f"{BASE_URL}/moments", headers=headers_a)
    moments = resp.json()
    room_moments = [m for m in moments if m.get("room") and m["room"].get("id") == room_id]
    
    print(f"\nMoments for ended room:")
    all_false = True
    for i, moment in enumerate(room_moments, 1):
        is_live = moment["room"].get("is_live")
        print(f"  Moment {i}: is_live={is_live}")
        if is_live != False:
            all_false = False
    
    if len(room_moments) != 2:
        print(f"❌ FAILED: Expected 2 moments for this room, found {len(room_moments)}")
        return
    
    if not all_false:
        print(f"❌ FAILED: All moments should show is_live=false after room ended")
        return
    
    print(f"✅ PASSED: Both moments show is_live=false (computed live from room state)")
    
    # FINAL SUMMARY
    print("\n" + "="*80)
    print("🎉 ALL TESTS PASSED (9/9)")
    print("="*80)
    print("✅ Step 1: Room created without share_to_moments")
    print("✅ Step 2: No moment created initially")
    print("✅ Step 3: Host shared room to moments (201)")
    print("✅ Step 4: Moment created with is_live=true, correct title")
    print("✅ Step 5: Second share created second moment (repeatable)")
    print("✅ Step 6: Non-host rejected with 403")
    print("✅ Step 7: User B joined and raised hand (listener)")
    print("✅ Step 8: Host changed role to speaker, hand_raised reset")
    print("✅ Step 9: Room ended, both moments show is_live=false")
    print("="*80)

if __name__ == "__main__":
    main()
