import React from "react";
import { AppBar, Toolbar, Typography, IconButton, Box, Avatar } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";

export default function Topbar({ handleDrawerToggle, collapsed }) {
  const userEmail = localStorage.getItem("userEmail");

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
          Admin Dashboard
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Typography variant="body2" sx={{ mr: 2 }}>
            {userEmail}
          </Typography>
          <Avatar>{userEmail ? userEmail[0].toUpperCase() : "A"}</Avatar>
        </Box>
      </Toolbar>
    </AppBar>
  );
}