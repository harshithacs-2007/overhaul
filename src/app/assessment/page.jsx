import AssessmentExperience from "@/components/overhaul/AssessmentExperience";
import AssessmentReportLauncher from "@/components/overhaul/AssessmentReportLauncher";
import RegionalClimateLens from "@/components/overhaul/RegionalClimateLens";
import RoomScanCamera from "@/components/overhaul/RoomScanCamera";

export default function AssessmentPage() {
  return (
    <>
      <AssessmentExperience />
      <RoomScanCamera />
      <RegionalClimateLens />
      <AssessmentReportLauncher />
    </>
  );
}
