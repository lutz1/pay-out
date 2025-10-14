import React, { useState, useEffect } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Avatar,
  Menu,
  MenuItem,
  Divider,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import LogoutIcon from "@mui/icons-material/Logout";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function Topbar({ handleDrawerToggle, collapsed, role = "admin" }) {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
  const [userEmail, setUserEmail] = useState(localStorage.getItem("userEmail") || "");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        localStorage.clear();
        navigate("/login", { replace: true });
      } else {
        setUserEmail(user.email || localStorage.getItem("userEmail"));
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleMenuOpen = (event) => setAnchorEl(event.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.clear();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <AppBar
      position="fixed"
      sx={{
        width: `calc(100% - ${collapsed ? 60 : 240}px)`,
        ml: `${collapsed ? 60 : 240}px`,
        transition: "width 0.3s, margin 0.3s",
        zIndex: (theme) => theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar>
        <IconButton
          color="inherit"
          edge="start"
          onClick={handleDrawerToggle}
          sx={{ mr: 2, display: { sm: "none" } }}
        >
          <MenuIcon />
        </IconButton>

        <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
          {role === "admin" ? "Admin Dashboard" : "Encoder Dashboard"}
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Typography variant="body2" sx={{ mr: 2 }}>
            {userEmail}
          </Typography>
          <IconButton onClick={handleMenuOpen} sx={{ p: 0 }}>
            <Avatar>{userEmail ? userEmail[0].toUpperCase() : "U"}</Avatar>
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            <Typography sx={{ px: 2, py: 1, fontWeight: 500 }}>{userEmail}</Typography>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <LogoutIcon fontSize="small" sx={{ mr: 1 }} />
              Logout
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
}