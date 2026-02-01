# 04-01 Summary: Learning Session API Endpoints

## Endpoint specifications
- POST /learning/generate
  - Request: query (required), user_id (optional)
  - Response: learning session metadata plus nodes array
  - Behavior: calls CourseOrchestrator.generate_course and returns session + nodes
- GET /learning/sessions/{session_id}
  - Response: learning session metadata plus nodes array
  - Behavior: returns 404 if session is missing
- GET /learning/nodes/{node_id}
  - Response: concept node plus content_visible and quiz_visible flags
  - Behavior: returns 404 if node is missing
- POST /learning/nodes/{node_id}/transition
  - Request: target_status
  - Response: updated concept node
  - Behavior: returns 400 for invalid transitions, 404 if node is missing

## State-based visibility rules
- content_markdown is hidden unless status is VIEWING_EXPLANATION, SHOWING_FEEDBACK, or COMPLETED
- quiz is hidden unless status is IN_QUIZ, SHOWING_FEEDBACK, or COMPLETED
- visibility flags reflect the same state checks as the hidden fields

## Error handling approach
- Expected errors raise HTTPException with 404 (missing session/node) or 400 (invalid transition)
- Unexpected errors are logged and wrapped with 500 responses

## Commit
- 0cdffdb
