from backend.models.event import RiskLevel

class RiskAssessmentService:
    @staticmethod
    def assess_risk(risk_score: float, confidence: float) -> RiskLevel:
        """
        Evaluate risk level based on confidence-adjusted risk score.
        Adheres to non-medical diagnostic terminology:
        - Normal
        - Elevated Risk
        - High Risk
        """
        # Weighted effective risk
        effective_score = risk_score * (0.5 + 0.5 * confidence)
        
        if effective_score >= 0.70:
            return RiskLevel.HIGH_RISK
        elif effective_score >= 0.40:
            return RiskLevel.ELEVATED_RISK
        else:
            return RiskLevel.NORMAL
