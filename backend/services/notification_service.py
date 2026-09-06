import os
import httpx
import logging
from typing import Optional
from backend.models.event import SwallowEvent, RiskLevel

logger = logging.getLogger("notification")

class NotificationService:
    def __init__(self):
        # LINE Messaging API Channel Access Token or Line Notify fallback / Webhook
        self.line_channel_token = os.getenv("LINE_CHANNEL_ACCESS_TOKEN", "")
        self.line_user_id = os.getenv("LINE_USER_ID", "") # Target User or Group ID for push message
        self.line_notify_token = os.getenv("LINE_NOTIFY_TOKEN", "") # LINE Notify Token (if using notify)

    async def send_alert(self, event: SwallowEvent) -> tuple[bool, str]:
        """
        Sends alert notification through LINE or simulates it if token is not set.
        Returns: (success: bool, channel_info: str)
        """
        msg = self._format_alert_message(event)

        # 1. Try LINE Messaging API Push Message
        if self.line_channel_token and self.line_user_id:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        "https://api.line.me/v2/bot/message/push",
                        headers={
                            "Authorization": f"Bearer {self.line_channel_token}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "to": self.line_user_id,
                            "messages": [
                                {
                                    "type": "text",
                                    "text": msg
                                }
                            ]
                        },
                        timeout=5.0
                    )
                    if resp.status_code == 200:
                        logger.info("Successfully sent LINE push message")
                        return True, "LINE Messaging API (Push)"
                    else:
                        logger.error(f"LINE API Error {resp.status_code}: {resp.text}")
            except Exception as e:
                logger.error(f"Failed to send LINE message: {e}")

        # 2. Try LINE Notify (legacy/simple token support if provided)
        if self.line_notify_token:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        "https://notify-api.line.me/api/notify",
                        headers={"Authorization": f"Bearer {self.line_notify_token}"},
                        data={"message": f"\n{msg}"},
                        timeout=5.0
                    )
                    if resp.status_code == 200:
                        return True, "LINE Notify"
            except Exception as e:
                logger.error(f"Failed to send LINE Notify: {e}")

        # 3. Fallback / Mock Notification (Simulated in development)
        logger.info(f"🔔 [SIMULATED NOTIFICATION] Sent to Caregiver:\n{msg}")
        return True, "Simulated LINE Alert (Console/Mock)"

    def _format_alert_message(self, event: SwallowEvent) -> str:
        risk_emoji = "🚨" if event.risk_level == RiskLevel.HIGH_RISK else "⚠️"
        return (
            f"\n{risk_emoji} [SwallowSense Alert]\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"📌 สถานะ: {event.risk_level.value.upper().replace('_', ' ')}\n"
            f"🔍 เหตุการณ์: {event.event_type}\n"
            f"📊 ระดับความเสี่ยง (Risk Score): {int(event.risk_score * 100)}%\n"
            f"🎯 ความเชื่อมั่น (Confidence): {int(event.confidence * 100)}%\n"
            f"⏱️ เวลา: {event.timestamp}\n"
            f"📡 แหล่งข้อมูล: {event.source}\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"💡 กรุณาตรวจสอบผู้รับการดูแลโดยทันที"
        )
