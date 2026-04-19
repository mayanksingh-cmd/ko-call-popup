import { Routes, Route, Navigate } from "react-router-dom";
import KickoffCallPage from "./pages/KickoffCallPage";
import ReschedulePage from "./pages/ReschedulePage";
import PostCallPage from "./pages/PostCallPage";

export default function App() {
  return (
    <Routes>
      {/* Main meeting page — token identifies which KO call to join */}
      <Route path="/ko-call/:token" element={<KickoffCallPage />} />

      {/* Reschedule page — shown when user clicks "Reschedule instantly" */}
      <Route path="/reschedule/:token" element={<ReschedulePage />} />

      {/* Post-call page — shown after user leaves; token used for recovery notification */}
      <Route path="/post-call/:token" element={<PostCallPage />} />

      {/* Default: demo meeting for local testing */}
      <Route path="/" element={<Navigate to="/ko-call/demo-token-abc123" replace />} />
    </Routes>
  );
}
