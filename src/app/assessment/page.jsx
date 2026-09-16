import AssessmentExperience from "@/components/overhaul/AssessmentExperience";
import AssessmentReportLauncher from "@/components/overhaul/AssessmentReportLauncher";
import RegionalClimateLens from "@/components/overhaul/RegionalClimateLens";
import RoomScanCamera from "@/components/overhaul/RoomScanCamera";
import RetrofitTransitionVisualizer from "@/components/overhaul/RetrofitTransitionVisualizer";

export default function AssessmentPage() {
  return (
    <>
      <AssessmentExperience />
      <RetrofitTransitionVisualizer />
      <RoomScanCamera />
      <RegionalClimateLens />
      <AssessmentReportLauncher />
    </>
  );
}
