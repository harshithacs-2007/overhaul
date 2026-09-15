import AssessmentExperience from "@/components/overhaul/AssessmentExperience";
import AssessmentReportLauncher from "@/components/overhaul/AssessmentReportLauncher";
import RegionalClimateLens from "@/components/overhaul/RegionalClimateLens";
import RetrofitIntelligenceSuite from "@/components/overhaul/RetrofitIntelligenceSuite";

export default function AssessmentPage() {
  return (
    <>
      <AssessmentExperience />
      <RegionalClimateLens />
      <RetrofitIntelligenceSuite
        scope="building"
        values={{}}
        extracts={[]}
        climate={null}
      />
      <AssessmentReportLauncher />
    </>
  );
}
