import React from "react";
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  IconButton,
  Typography,
  Tooltip,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import PeopleIcon from "@mui/icons-material/People";
import BuildIcon from "@mui/icons-material/Build";
import ListAltIcon from "@mui/icons-material/ListAlt";
import AssessmentIcon from "@mui/icons-material/Assessment";

const drawerWidth = 240;
const collapsedWidth = 60;

export default function Sidebar({
  mobileOpen,
  handleDrawerToggle,
  collapsed,
  handleCollapseToggle,
  role = "admin", // default to admin
}) {
  const navigate = useNavigate();

  // ✅ Dynamic menu items based on role
  const menuItems = role === "admin"
    ? [
        { text: "Dashboard", path: "/admin", icon: <DashboardIcon /> },
        { text: "Manage Users", path: "/admin/users", icon: <PeopleIcon /> },
        { text: "Manage Fields", path: "/admin/fields", icon: <BuildIcon /> },
        { text: "Master List", path: "/admin/master-list", icon: <ListAltIcon /> },
        { text: "Generate Report", path: "/admin/reports", icon: <AssessmentIcon /> },
      ]
    : [
        { text: "Dashboard", path: "/encoder", icon: <DashboardIcon /> },
        { text: "Master List", path: "/encoder/master-list", icon: <ListAltIcon /> },
        { text: "Reports", path: "/encoder/reports", icon: <AssessmentIcon /> },
      ];

  const drawerContent = (
    <>
      <Toolbar
        sx={{
          display: "flex",
          justifyContent: collapsed ? "center" : "space-between",
          alignItems: "center",
          px: 2,
          transition: "all 0.3s",
          minHeight: 64,
        }}
      >
        {!collapsed && (
          <Typography variant="h6">
            {role === "admin" ? "Admin Panel" : "Encoder Panel"}
          </Typography>
        )}
        <IconButton
          onClick={handleCollapseToggle}
          sx={{ transition: "all 0.3s", ...(collapsed && { mx: "auto" }) }}
        >
          {collapsed ? <MenuIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding sx={{ display: "block" }}>
            <Tooltip title={collapsed ? item.text : ""} placement="right" arrow>
              <ListItemButton
                onClick={() => navigate(item.path)}
                sx={{
                  justifyContent: collapsed ? "center" : "initial",
                  px: 2,
                  py: 1.2,
                  "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.08)" },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: collapsed ? 0 : 2,
                    justifyContent: "center",
                    color: "inherit",
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  sx={{ opacity: collapsed ? 0 : 1, transition: "opacity 0.3s" }}
                />
              </ListItemButton>
            </Tooltip>
          </ListItem>
        ))}
      </List>
    </>
  );

  return (
    <>
      {/* Permanent drawer */}
      <Drawer
        variant="permanent"
        sx={{
          width: collapsed ? collapsedWidth : drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: collapsed ? collapsedWidth : drawerWidth,
            boxSizing: "border-box",
            overflowX: "hidden",
            transition: "width 0.3s",
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Temporary drawer (mobile) */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        sx={{
          display: { xs: "block", sm: "none" },
          "& .MuiDrawer-paper": { width: drawerWidth, boxSizing: "border-box" },
        }}
      >
        {drawerContent}
      </Drawer>
    </>
  );
}