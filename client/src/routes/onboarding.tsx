import { useNavigate } from "react-router-dom";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export default function OnboardingRoute() {
  const navigate = useNavigate();
  return <OnboardingWizard onDone={() => navigate("/containers")} />;
}
