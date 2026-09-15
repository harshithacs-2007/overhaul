import AssessmentExperience from "@/components/overhaul/AssessmentExperience";
import AssessmentReportLauncher from "@/components/overhaul/AssessmentReportLauncher";
import RegionalClimateLens from "@/components/overhaul/RegionalClimateLens";
import RetrofitIntelligenceRuntime from "@/components/overhaul/RetrofitIntelligenceRuntime";

export default function AssessmentPage() {
  return (
    <>
      <AssessmentExperience />
      <RegionalClimateLens />
      <RetrofitIntelligenceRuntime />
      <AssessmentReportLauncher />
    </>
  );
}
