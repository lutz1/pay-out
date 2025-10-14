import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Toolbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Card,
  CardContent,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Button,
  LinearProgress,
} from "@mui/material";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { db } from "../../firebase";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import * as XLSX from "xlsx";

export default function AdminDashboard() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    JSON.parse(localStorage.getItem("sidebarCollapsed") || "false")
  );
  const [payouts, setPayouts] = useState([]);
  const [selectedPayout, setSelectedPayout] = useState("");
  const [excelData, setExcelData] = useState([]);
  const [registeredData, setRegisteredData] = useState([]);
  const [encoderNames, setEncoderNames] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverTime, setServerTime] = useState("");

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleCollapseToggle = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem("sidebarCollapsed", JSON.stringify(newCollapsed));
  };

  // 🔹 Fetch ongoing payouts
  useEffect(() => {
    const fetchPayouts = async () => {
      try {
        const q = query(
          collection(db, "payoutschedules"),
          where("status", "==", "PAY-OUT ONGOING")
        );
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPayouts(list);
      } catch (err) {
        console.error("Error fetching payouts:", err);
      }
    };
    fetchPayouts();
  }, []);

  // 🔹 Fetch Excel Data (for control number + names)
  useEffect(() => {
    if (!selectedPayout) return;
    const fetchExcelData = async () => {
      try {
        setLoading(true);
        const payout = payouts.find((p) => p.id === selectedPayout);
        if (!payout?.fileUrl) {
          setExcelData([]);
          return;
        }
        const res = await fetch(payout.fileUrl);
        const arrayBuffer = await res.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        const formatted = jsonData.map((row, i) => ({
          rowId: i + 1,
          controlNumber:
            row["CONTROL NUMBER"] || row["Control Number"] || row["controlNumber"],
          lastName: row["LAST NAME"] || row["Last Name"] || "",
          firstName: row["FIRST NAME"] || row["First Name"] || "",
          middleName: row["MIDDLE NAME"] || row["Middle Name"] || "",
          birthDay: row["BIRTH DAY"] || row["Birth Day"] || "",
          birthMonth: row["BIRTH MONTH"] || row["Birth Month"] || "",
          birthYear: row["BIRTH YEAR"] || row["Birth Year"] || "",
          address: row["ADDRESS"] || row["Address"] || "",
          category: row["CATEGORY"] || row["Category"] || "",
          mtopAssb: row["MTOP/ASSB"] || row["Mtop/Assb"] || "",
          sex: row["SEX"] || row["Sex"] || "",
          occupation: row["OCCUPATION"] || row["Occupation"] || "",
          monthlySalary: row["MONTHLY SALARY"] || row["Monthly Salary"] || "",
          barangay: row["BARANGAY"] || row["Barangay"] || "",
          cityMunicipality:
            row["CITY/MUNICIPALITY"] || row["City/Municipality"] || "",
          province: row["PROVINCE"] || row["Province"] || "",
          typeOfAssistance:
            row["TYPE OF ASSISTANCE"] || row["Type of Assistance"] || "",
          amount: row["AMOUNT"] || row["Amount"] || "",
          charging: row["CHARGING"] || row["Charging"] || "",
        }));
        setExcelData(formatted);
      } catch (err) {
        console.error("Error loading Excel file:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchExcelData();
  }, [selectedPayout, payouts]);

  // 🔹 Fetch registered data
  useEffect(() => {
    if (!selectedPayout) return;
    const fetchRegistered = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "encoderRegistrations"),
          where("payoutId", "==", selectedPayout)
        );
        const snapshot = await getDocs(q);
        const regs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setRegisteredData(regs);

        // 🔹 Fetch encoder usernames
        const encoderIds = [
          ...new Set(regs.map((r) => r.userId).filter(Boolean)),
        ];
        const names = {};
        await Promise.all(
          encoderIds.map(async (uid) => {
            const userRef = doc(db, "users", uid);
            const userSnap = await getDoc(userRef);
            names[uid] = userSnap.exists()
              ? userSnap.data().username || "Unknown"
              : "Unknown";
          })
        );
        setEncoderNames(names);
      } catch (err) {
        console.error("Error fetching registered:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchRegistered();
  }, [selectedPayout]);

  // 🔹 Merge only registered rows with Excel info
  const registeredWithDetails = registeredData
    .map((reg, index) => {
      const match =
        excelData.find(
          (e) =>
            e.controlNumber === reg.controlNumber ||
            e.rowId === reg.rowId
        ) || {};
      return {
        no: index + 1,
        controlNumber: match.controlNumber || "",
        lastName: match.lastName || "",
        firstName: match.firstName || "",
        middleName: match.middleName || "",
        encoderName: encoderNames[reg.userId] || "Unknown",
        registeredAt: reg.timestamp
          ? new Date(reg.timestamp.seconds * 1000).toLocaleString()
          : "",
      };
    })
    .filter((r) => r.controlNumber || r.lastName);

  // 🔹 Server Time (auto update)
  useEffect(() => {
    const interval = setInterval(() => {
      setServerTime(new Date().toLocaleString());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // 🔹 Totals
  const totalRegistered = registeredWithDetails.length;
  const totalNotRegistered = excelData.length - totalRegistered;

  // 🔹 Export to Excel (Registered + Not Registered Overview)
const handleExportExcel = () => {
  if (excelData.length === 0) return;

  // Build a lookup of registered control numbers
  const registeredSet = new Set(
    registeredWithDetails.map((r) => r.controlNumber)
  );

  // Combine both registered and not registered
  const combinedData = excelData.map((row, index) => ({
    "No.": index + 1,
    "CONTROL NUMBER": row.controlNumber || "",
    "LAST NAME": row.lastName || "",
    "FIRST NAME": row.firstName || "",
    "MIDDLE NAME": row.middleName || "",
    "BIRTH DAY": row.birthDay || "",
    "BIRTH MONTH": row.birthMonth || "",
    "BIRTH YEAR": row.birthYear || "",
    "ADDRESS": row.address || "", 
    "CATEGORY": row.category || "",
    "MTOP/ASSB": row.mtopAssb || "",
    "SEX": row.sex || "",
    "OCCUPATION": row.occupation || "",
    "MONTHLY SALARY": row.monthlySalary || "",
    "BARANGAY": row.barangay || "",
    "CITY/MUNICIPALITY": row.cityMunicipality || "",
    "PROVINCE": row.province || "",
    "TYPE OF ASSISTANCE": row.typeOfAssistance || "",
    "AMOUNT": row.amount || "",
    "CHARGING": row.charging || "",
    "STATUS": registeredSet.has(row.controlNumber)
      ? "Registered"
      : "Not Registered",
  }));

  // Create sheet and export
  const ws = XLSX.utils.json_to_sheet(combinedData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Overview");
  XLSX.writeFile(wb, `Payout_${selectedPayout}_Overview_Report.xlsx`);
};

  return (
    <Box sx={{ display: "flex" }}>
      <Topbar handleDrawerToggle={handleDrawerToggle} collapsed={collapsed} />
      <Sidebar
        mobileOpen={mobileOpen}
        handleDrawerToggle={handleDrawerToggle}
        collapsed={collapsed}
        handleCollapseToggle={handleCollapseToggle}
        role="admin"
      />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          transition: "margin 0.3s",
          ml: collapsed ? "0px" : "0px",
          bgcolor: "#f5f5f5",
          minHeight: "100vh",
        }}
      >
        <Toolbar />
        <Typography variant="h4" gutterBottom fontWeight={600}>
          Admin Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          🕒 Server Time: {serverTime}
        </Typography>

        {/* 🔸 Select Payout */}
        <FormControl size="small" sx={{ minWidth: 300, mb: 3 }}>
          <InputLabel>Select Payout</InputLabel>
          <Select
            value={selectedPayout}
            onChange={(e) => setSelectedPayout(e.target.value)}
            label="Select Payout"
          >
            {payouts.map((payout) => (
              <MenuItem key={payout.id} value={payout.id}>
                {payout.title} — {payout.venue}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* 🔸 Summary Cards */}
        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ borderLeft: "5px solid green" }}>
              <CardContent sx={{ py: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Total Registered
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ color: "green", fontWeight: 700 }}
                >
                  {totalRegistered}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ borderLeft: "5px solid red" }}>
              <CardContent sx={{ py: 1 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Total Not Registered
                </Typography>
                <Typography variant="h6" sx={{ color: "red", fontWeight: 700 }}>
                  {totalNotRegistered}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {loading ? (
          <LinearProgress />
        ) : selectedPayout === "" ? (
          <Typography>Select a payout to display records.</Typography>
        ) : (
          <>
            <Button
              variant="contained"
              onClick={handleExportExcel}
              disabled={registeredWithDetails.length === 0}
              sx={{ mb: 2 }}
            >
              EXPORT EXCEL REPORT
            </Button>

            {/* 🔹 Table */}
            <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
              <TableContainer
                sx={{ maxHeight: "70vh", overflowX: "auto", overflowY: "auto" }}
              >
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: "bold" }}>No.</TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        CONTROL NUMBER
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>LAST NAME</TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        FIRST NAME
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        MIDDLE NAME
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        ENCODER NAME
                      </TableCell>
                      <TableCell sx={{ fontWeight: "bold" }}>
                        REGISTERED AT
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {registeredWithDetails.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center">
                          No registered records found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      registeredWithDetails.map((row) => (
                        <TableRow key={row.no} hover>
                          <TableCell>{row.no}</TableCell>
                          <TableCell>{row.controlNumber}</TableCell>
                          <TableCell>{row.lastName}</TableCell>
                          <TableCell>{row.firstName}</TableCell>
                          <TableCell>{row.middleName}</TableCell>
                          <TableCell>{row.encoderName}</TableCell>
                          <TableCell>{row.registeredAt}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </>
        )}
      </Box>
    </Box>
  );
}