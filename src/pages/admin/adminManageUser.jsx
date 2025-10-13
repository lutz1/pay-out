import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Snackbar,
  Alert,
  Toolbar,
  Grid,
} from "@mui/material";
import { db, auth } from "../../firebase";
import { collection, doc, setDoc, getDocs } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";

export default function AdminManageUser() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: "", email: "", role: "encoder" });
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleCollapseToggle = () => setCollapsed(!collapsed);

  // Fetch only encoder users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersRef = collection(db, "users");
        const snapshot = await getDocs(usersRef);
        const usersList = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((user) => user.role === "encoder");
        setUsers(usersList);
      } catch (error) {
        setSnackbar({ open: true, message: "Error fetching users", severity: "error" });
      }
    };
    fetchUsers();
  }, []);

  // Add new encoder/admin user
  const handleAddUser = async () => {
    if (!form.username || !form.email || !form.role) {
      setSnackbar({ open: true, message: "Please fill in all fields", severity: "warning" });
      return;
    }

    try {
      const defaultPassword = "defaultPassword123";
      const userCredential = await createUserWithEmailAndPassword(auth, form.email, defaultPassword);
      const uid = userCredential.user.uid;

      await setDoc(doc(db, "users", uid), {
        username: form.username,
        email: form.email,
        role: form.role,
      });

      setSnackbar({ open: true, message: `User ${form.username} added successfully!`, severity: "success" });
      setForm({ username: "", email: "", role: "encoder" });

      const usersRef = collection(db, "users");
      const snapshot = await getDocs(usersRef);
      const usersList = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((user) => user.role === "encoder");
      setUsers(usersList);
    } catch (error) {
      setSnackbar({ open: true, message: error.message, severity: "error" });
    }
  };

  return (
    <Box sx={{ display: "flex" }}>
      {/* Topbar + Sidebar */}
      <Topbar handleDrawerToggle={handleDrawerToggle} collapsed={collapsed} />
      <Sidebar
        mobileOpen={mobileOpen}
        handleDrawerToggle={handleDrawerToggle}
        collapsed={collapsed}
        handleCollapseToggle={handleCollapseToggle}
      />

      {/* Main Section */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          transition: "margin 0.3s",
          ml: { xs: 0, sm: collapsed ? "0px" : "0px" },
          mt: { xs: 7, sm: 0 },
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          minHeight: "100vh",
          backgroundColor: "#fafafa",
        }}
      >
        {/* Inner Content Wrapper (Centers content) */}
        <Box
          sx={{
            width: "100%",
            maxWidth: 900,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Toolbar />
          <Typography
            variant="h4"
            gutterBottom
            textAlign="center"
            sx={{ mb: 4, fontWeight: 600 }}
          >
            Manage Users
          </Typography>

          {/* Add User Form */}
          <Paper sx={{ p: { xs: 2, sm: 4 }, mb: 4, width: "100%", borderRadius: 3 }}>
            <Typography variant="h6" textAlign="center">
              Add User / Encoder
            </Typography>
            <Box
              component="form"
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                mt: 2,
              }}
            >
              <TextField
                label="Username"
                fullWidth
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
              <TextField
                label="Email"
                fullWidth
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <MenuItem value="encoder">Encoder</MenuItem>
                  <MenuItem value="admin">Admin</MenuItem>
                </Select>
              </FormControl>
              <Button variant="contained" onClick={handleAddUser}>
                Add User
              </Button>
            </Box>
          </Paper>

          {/* Encoders List */}
          <Paper sx={{ p: { xs: 2, sm: 4 }, width: "100%", borderRadius: 3 }}>
            <Typography variant="h6" textAlign="center">
              All Encoders
            </Typography>
            <Grid container spacing={2} sx={{ mt: 2 }}>
              {users.length > 0 ? (
                users.map((user) => (
                  <Grid item xs={12} sm={6} md={4} key={user.id}>
                    <Paper
                      sx={{
                        p: 2,
                        textAlign: "center",
                        borderRadius: 2,
                        backgroundColor: "#f9f9f9",
                      }}
                    >
                      <Typography variant="subtitle1" fontWeight={600}>
                        {user.username}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {user.email}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="primary"
                        fontWeight={500}
                      >
                        {user.role.toUpperCase()}
                      </Typography>
                    </Paper>
                  </Grid>
                ))
              ) : (
                <Grid item xs={12}>
                  <Typography textAlign="center" color="text.secondary">
                    No encoder users found.
                  </Typography>
                </Grid>
              )}
            </Grid>
          </Paper>
        </Box>
      </Box>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}