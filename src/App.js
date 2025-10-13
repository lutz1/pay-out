import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/login";
import AdminDashboard from "./pages/admin/adminDashboard";
import AdminManageUser from "./pages/admin/adminManageUser";
// import EncoderDashboard from "./pages/encoder/encoderDashboard"; // Uncomment when ready

function App() {
  // Get user role from localStorage (set after login)
  const role = localStorage.getItem("userRole");

  return (
    <Router>
      <Routes>
        {/* Login Page */}
        <Route path="/login" element={<Login />} />

        {/* Admin Dashboard */}
        <Route
          path="/admin"
          element={role === "admin" ? <AdminDashboard /> : <Navigate to="/login" />}
        />
        <Route
          path="/admin/users"
          element={role === "admin" ? <AdminManageUser /> : <Navigate to="/login" />}
        />

        {/* Encoder Dashboard (to be implemented) */}
        {/*
        <Route
          path="/encoder"
          element={role === "encoder" ? <EncoderDashboard /> : <Navigate to="/login" />}
        />
        */}

        {/* Default route redirects to login */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;