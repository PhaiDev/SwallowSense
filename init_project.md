# SwallowSense — Project Context

## 1. Project Overview

SwallowSense is a prototype technology project focused on **monitoring and detecting abnormal events related to swallowing and eating**, with an initial interest in identifying potentially dangerous situations such as choking/aspiration and notifying a caregiver or responsible person in time.

The project is still in the **early exploration and foundation stage**.

The exact problem, target users, detection method, hardware, and core features have **not been finalized yet**.

Therefore, the current goal is **NOT to build the final AI choking-detection system immediately**.

The current goal is to build a flexible software foundation that can support multiple possible detection approaches later.

---

## 2. Current Problem Understanding

The initial hypothesis is:

> During eating, a person may experience an abnormal swallowing event or choking-related incident, and the person responsible for monitoring them may not notice the event immediately.

However, this is only a **hypothesis**, not a confirmed problem statement.

We still need to investigate:

* Who exactly experiences the problem?
* Who monitors them?
* What happens during a real incident?
* How often does the problem occur?
* What makes current monitoring insufficient?
* How quickly does someone need to respond?
* What signals can reliably indicate an abnormal event?
* What causes false alarms?
* Whether the most important problem is detection, response time, monitoring burden, or something else.

Do not assume these answers without evidence.

---

# 3. Important Product Principle

The project should follow:

**Problem → Evidence → Solution → Technology**

rather than:

**Technology → Find a problem**

Do not lock the project into a specific technology simply because it is technically interesting.

For example, the system may eventually use:

* Camera / Computer Vision
* Microphone / Audio Analysis
* Wearable sensors
* Motion sensors
* Multiple sensors
* Edge AI
* Smartphone
* ESP32 or another embedded device
* A combination of hardware and software

But these decisions should be made after validating the actual problem and available signals.

---

# 4. Current Development Goal

At this stage, build the **software foundation / application skeleton** before implementing the final detection technology.

The application should be designed so that the detection component can be replaced later without requiring a complete rewrite of the application.

The architecture should therefore separate:

1. Data acquisition
2. Detection
3. Risk assessment
4. Event management
5. Notification
6. Data storage
7. Dashboard / user interface

---

# 5. Proposed High-Level Architecture

```text
                    SwallowSense
                         │
                         ▼
              ┌─────────────────────┐
              │   Data Acquisition  │
              │ Camera / Audio /    │
              │ Sensor / Future     │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │     Detection       │
              │ AI / Algorithm /    │
              │ Mock Detection      │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Risk Assessment   │
              │ confidence / score  │
              └──────────┬──────────┘
                         │
                ┌────────┴────────┐
                ▼                 ▼
             NORMAL           HIGH RISK
                │                 │
                ▼                 ▼
             Logging            Alert
                │                 │
                └────────┬────────┘
                         ▼
              ┌─────────────────────┐
              │      Backend        │
              │ API / Event System  │
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        Database              Notification
              │                     │
              ▼                     ▼
         Dashboard              Caregiver
```

This architecture is provisional and should be refined as the problem becomes clearer.

---

# 6. Current MVP

The first MVP should **not require real AI**.

Instead, implement a Mock Detection layer.

Example:

```json
{
  "event_type": "possible_abnormal_event",
  "confidence": 0.87,
  "risk_score": 0.82,
  "timestamp": "2026-09-06T20:00:00"
}
```

The application should be able to receive this event and process it as if it came from a real detection model.

Example flow:

```text
Mock Detection
      ↓
POST /api/events
      ↓
Backend
      ↓
Risk Assessment
      ↓
Save Event
      ↓
Dashboard
      ↓
If high risk → Notification
```

Later, Mock Detection can be replaced by a real AI model without changing the entire application architecture.

---

# 7. Core Application Components

## A. Dashboard

The dashboard should eventually provide:

* Current monitoring status
* Current risk status
* Recent events
* Event history
* Risk/confidence information
* Alert status
* Monitoring status

Example:

```text
SwallowSense

Monitoring: ACTIVE

Current Status:
NORMAL

Risk Score:
12%

Recent Events:
09:31  Normal
09:42  Normal
10:05  Possible abnormal event
```

The UI should remain simple at first.

Do not add unnecessary features before the core workflow is validated.

---

## B. Event System

Every detected event should be represented as an event object.

Possible fields:

```text
id
timestamp
event_type
confidence
risk_score
duration
status
source
metadata
```

Example:

```json
{
  "event_type": "possible_abnormal_event",
  "confidence": 0.91,
  "risk_score": 0.84,
  "duration": 4.2,
  "status": "unconfirmed",
  "source": "mock"
}
```

The exact event types are provisional.

Do not assume that "choking" is the final classification.

---

## C. Detection Abstraction

Create a clear interface between the detection system and the rest of the application.

Conceptually:

```text
Detection Input
      ↓
Detection Engine
      ↓
Detection Result
      ↓
Application
```

The application should not care whether the result came from:

```text
Camera
Microphone
ESP32
AI model
Cloud API
Edge model
Mock data
```

It should only receive a standardized detection result.

---

# 8. Risk Assessment

Do not treat the detection output as an automatic medical diagnosis.

The system should initially use terms such as:

* Normal
* Possible abnormal event
* Elevated risk
* High-risk event

rather than claiming:

> "The person is definitely choking."

The exact risk model will be determined later after research and experimentation.

---

# 9. Notification System

The notification system should also be independent from detection.

Conceptually:

```text
Detection
    ↓
Risk Assessment
    ↓
Event
    ↓
Notification Service
```

The notification channel could later be:

* Mobile notification
* Web notification
* LINE
* SMS
* Other caregiver alert mechanisms

Do not lock the implementation to one notification platform yet.

For now, logging or a simple simulated notification is sufficient.

---

# 10. Database

The database should initially focus on storing events and system information rather than trying to model the entire medical domain.

Potential entities:

```text
users
devices
monitoring_sessions
events
notifications
```

Keep the schema flexible because the real requirements are not yet known.

---

# 11. Recommended Initial Project Structure

Use a modular structure similar to:

```text
swallowsense/
│
├── frontend/
│   ├── dashboard/
│   ├── events/
│   └── components/
│
├── backend/
│   ├── api/
│   ├── services/
│   ├── models/
│   ├── detection/
│   ├── risk/
│   └── notification/
│
├── database/
│
├── detection/
│   └── mock/
│
├── docs/
│   ├── architecture/
│   ├── research/
│   └── decisions/
│
└── README.md
```

The exact framework and folder structure can be changed based on the selected stack.

---

# 12. Development Priorities

Build in this order:

### Phase 1 — Foundation

* Project setup
* Frontend
* Backend
* Database
* Basic API
* Event model
* Dashboard

### Phase 2 — Mock Pipeline

Make this work end-to-end:

```text
Mock Detection
      ↓
API
      ↓
Event Processing
      ↓
Database
      ↓
Dashboard
      ↓
Mock Alert
```

### Phase 3 — Problem Research

Investigate the actual problem through:

* Literature research
* Interviews
* Observation
* Existing solutions
* User needs
* Failure cases
* Detection signals

### Phase 4 — Detection Prototype

Only after obtaining enough evidence:

```text
Real Input
    ↓
Feature Extraction
    ↓
Detection Model
    ↓
Risk Assessment
    ↓
Alert
```

### Phase 5 — Evaluation

Evaluate:

* Detection accuracy
* False positives
* False negatives
* Detection latency
* Robustness
* Usability
* Reliability

---

# 13. What the AI Developer Should NOT Do Yet

Do NOT:

* Assume the final target user
* Assume choking is the only problem
* Assume camera is the best solution
* Assume microphone is the best solution
* Build a complex AI model immediately
* Buy or design final hardware
* Add many unrelated features
* Claim medical-grade accuracy
* Present the system as a medical diagnostic device
* Over-engineer the architecture before requirements are known

When an important decision is unclear, identify the decision and explain what evidence is needed to make it.

---

# 14. Current Definition of Success

The first version is successful if:

1. The application can receive a detection event.
2. The backend can process the event.
3. The event can be stored.
4. The dashboard can display the event.
5. A high-risk event can trigger a simulated alert.
6. The detection source can later be replaced without rewriting the entire application.
7. The architecture remains flexible while the real problem is being researched.

The goal is to build a **strong foundation**, not the final SwallowSense product.

---

# 15. Guiding Question

At every major design decision, ask:

> **"What problem are we solving, and what evidence do we have that this is actually the problem?"**

Technology choices should follow the answer to that question.
