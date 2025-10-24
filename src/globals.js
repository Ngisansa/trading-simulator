// Mock global variables needed for the Firebase logic to run locally.
// These variables would be injected by the deployment environment (Canvas).

// Mock Firebase Config (can be empty but must be a valid JSON string)
window.__firebase_config = '{}';

// Mock App ID (used for Firestore path construction)
window.__app_id = 'local-trading-simulator';

// Mock Auth Token (used for user authentication)
window.__initial_auth_token = 'local-auth-token-user123';
