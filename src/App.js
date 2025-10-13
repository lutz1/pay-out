import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/login";
import AdminDashboard from "./pages/admin/adminDashboard";
import AdminManageUser from "./pages/admin/adminManageUser";
import AdminManageField from "./pages/admin/adminManageField"; // ✅ new
import EncoderDashboard from "./pages/encoder/encoderDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import Unauthorized from "./pages/Unauthorized";

function App() {
  return (
    <Router>
      <Routes>
        {/* 🌐 Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* 🛠 Admin Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminManageUser />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/fields"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminManageField />
            </ProtectedRoute>
          }
        />

        {/* 🧾 Encoder Routes */}
        <Route
          path="/encoder"
          element={
            <ProtectedRoute allowedRoles={["encoder"]}>
              <EncoderDashboard />
            </ProtectedRoute>
          }
        />

        {/* 🚪 Fallback */}
        <Route path="*" element={<Login />} />
      </Routes>
    </Router>
  );
}

export default App;