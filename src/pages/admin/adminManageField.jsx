import React, { useState, useEffect, useRef } from "react"; 
import {
  Box,
  Typography,
  Toolbar,
  Paper,
  Stack,
  TextField,
  Button,
  MenuItem,
  IconButton,
  Snackbar,
  Alert,
  Grid,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  LinearProgress,
} from "@mui/material";
import CategoryIcon from "@mui/icons-material/Category";
import DeleteIcon from "@mui/icons-material/Delete";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";

// Firebase imports
import { db, auth, storage } from "../../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

export default function AdminManageField() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Sectors
  const [sector, setSector] = useState("");
  const [newSector, setNewSector] = useState("");
  const [sectors, setSectors] = useState([]);

  // Categories
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [categories, setCategories] = useState([]);

  // Payout Fields
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [amount, setAmount] = useState("");
  const [beneficiaryCount, setBeneficiaryCount] = useState("");
  const [date, setDate] = useState("");
  const [payouts, setPayouts] = useState([]);

  // Excel Import
  const fileInputRef = useRef(null);
  const [importedFile, setImportedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Snackbar
  const [snack, setSnack] = useState({ open: false, severity: "success", message: "" });

  // Sidebar toggle
  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleCollapseToggle = () => setCollapsed(!collapsed);

  // Load sectors/categories from localStorage
  useEffect(() => {
    const storedSectors = JSON.parse(localStorage.getItem("sectors") || "[]");
    const storedCategories = JSON.parse(localStorage.getItem("categories") || "[]");
    setSectors(storedSectors);
    setCategories(storedCategories);
  }, []);

  // Add/Delete Sector
  const handleAddSector = () => {
    const trimmed = newSector.trim();
    if (!trimmed) return;
    if (sectors.includes(trimmed)) {
      return setSnack({ open: true, severity: "warning", message: "Sector already exists." });
    }
    const updated = [...sectors, trimmed];
    setSectors(updated);
    localStorage.setItem("sectors", JSON.stringify(updated));
    setNewSector("");
    setSnack({ open: true, severity: "success", message: "Sector added successfully." });
  };
  const handleDeleteSector = (s) => {
    const updated = sectors.filter((sec) => sec !== s);
    setSectors(updated);
    localStorage.setItem("sectors", JSON.stringify(updated));
    if (sector === s) setSector("");
    setSnack({ open: true, severity: "info", message: `Sector "${s}" deleted.` });
  };

  // Add/Delete Category
  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) {
      return setSnack({ open: true, severity: "warning", message: "Category already exists." });
    }
    const updated = [...categories, trimmed];
    setCategories(updated);
    localStorage.setItem("categories", JSON.stringify(updated));
    setNewCategory("");
    setSnack({ open: true, severity: "success", message: "Category added successfully." });
  };
  const handleDeleteCategory = (c) => {
    const updated = categories.filter((cat) => cat !== c);
    setCategories(updated);
    localStorage.setItem("categories", JSON.stringify(updated));
    if (category === c) setCategory("");
    setSnack({ open: true, severity: "info", message: `Category "${c}" deleted.` });
  };

  // Add new payout with Firestore & Storage
  const handleAddPayout = async () => {
    if (!title || !venue || !amount || !beneficiaryCount || !date) {
      return setSnack({ open: true, severity: "warning", message: "Please fill in all payout details." });
    }

    if (!auth.currentUser) {
      return setSnack({ open: true, severity: "error", message: "You must be logged in to upload files." });
    }

    let fileUrl = null;

    if (importedFile) {
      try {
        const storageRef = ref(storage, `payouts/${Date.now()}_${importedFile.name}`);
        const uploadTask = uploadBytesResumable(storageRef, importedFile);

        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
          },
          (error) => {
            setSnack({ open: true, severity: "error", message: `File upload failed: ${error.message}` });
          }
        );

        await uploadTask;
        fileUrl = await getDownloadURL(storageRef);
      } catch (err) {
        return setSnack({ open: true, severity: "error", message: `Upload failed: ${err.message}` });
      }
    }

    try {
      await addDoc(collection(db, "payoutschedules"), {
        title,
        venue,
        amount,
        beneficiaryCount,
        date,
        status: "PAY-OUT ONGOING",
        category,
        sector,
        fileUrl,
        createdAt: serverTimestamp(),
      });

      setPayouts((prev) => [
        ...prev,
        { id: Date.now(), title, venue, amount, beneficiaryCount, date, status: "PAY-OUT ONGOING", fileName: importedFile?.name || null, fileUrl },
      ]);

      setSnack({ open: true, severity: "success", message: "Payout Schedule added successfully." });

      // Reset all fields
      setTitle(""); setVenue(""); setAmount(""); setBeneficiaryCount(""); setDate("");
      setImportedFile(null); setUploadProgress(0); setCategory(""); setSector("");
    } catch (err) {
      setSnack({ open: true, severity: "error", message: `Saving payout failed: ${err.message}` });
    }
  };

  const handleDeletePayout = (id) => {
    setPayouts((prev) => prev.filter((p) => p.id !== id));
    setSnack({ open: true, severity: "info", message: "Payout Schedule deleted." });
  };

  // Import Excel
  const handleImportClick = () => fileInputRef.current.click();
  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportedFile(file);
    setUploadProgress(100);
    setSnack({ open: true, severity: "info", message: `File "${file.name}" ready for upload.` });

    event.target.value = null;
  };

  return (
    <Box sx={{ display: "flex" }}>
      <Sidebar mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle} collapsed={collapsed} handleCollapseToggle={handleCollapseToggle} />
      <Box component="main" sx={{ flexGrow: 1, width: { sm: `calc(100% - ${collapsed ? 60 : 240}px)` }, bgcolor: "#f5f5f5", minHeight: "100vh", transition: "width 0.3s" }}>
        <Topbar handleDrawerToggle={handleDrawerToggle} collapsed={collapsed} />
        <Toolbar />
        <Box sx={{ p: 3 }}>
          <Typography variant="h5" gutterBottom>Manage Categories, Sectors & Payout Info</Typography>

          {/* Buttons */}
          <Stack direction="row" spacing={2} mb={3}>
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={handleImportClick}>Import Excel</Button>
            <input type="file" accept=".xlsx,.xls" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChange} />
            <Button variant="contained" onClick={handleAddPayout}>Add Payout Schedule</Button>
          </Stack>

          {/* File Info */}
          {importedFile && (
            <Box sx={{ mb: 2 }}>
              <Typography>File ready: {importedFile.name}</Typography>
              {uploadProgress > 0 && <LinearProgress variant="determinate" value={uploadProgress} />}
            </Box>
          )}

          {/* Category & Sector */}
          <Grid container spacing={3}>
            {/* Categories */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="h6" mb={2}>🗂 Manage Categories</Typography>
                <Stack spacing={3}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField label="Add New Category" placeholder="e.g. Finance" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} fullWidth />
                    <Button variant="contained" startIcon={<CategoryIcon />} onClick={handleAddCategory} disabled={!newCategory.trim()}>Add</Button>
                  </Stack>
                  <TextField select label="Select Category" value={category} onChange={(e) => setCategory(e.target.value)} fullWidth>
                    {categories.length === 0 && <MenuItem disabled>No categories available</MenuItem>}
                    {categories.map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
                        <IconButton edge="end" size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDeleteCategory(c); }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
              </Paper>
            </Grid>

            {/* Sectors */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 3, borderRadius: 2 }}>
                <Typography variant="h6" mb={2}>🏢 Manage Sectors</Typography>
                <Stack spacing={3}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField label="Add New Sector" placeholder="e.g. Agriculture" value={newSector} onChange={(e) => setNewSector(e.target.value)} fullWidth />
                    <Button variant="contained" startIcon={<CategoryIcon />} onClick={handleAddSector} disabled={!newSector.trim()}>Add</Button>
                  </Stack>
                  <TextField select label="Select Sector" value={sector} onChange={(e) => setSector(e.target.value)} fullWidth>
                    {sectors.length === 0 && <MenuItem disabled>No sectors available</MenuItem>}
                    {sectors.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                        <IconButton edge="end" size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDeleteSector(s); }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
              </Paper>
            </Grid>
          </Grid>

          {/* Payout Details Form */}
          <Paper sx={{ p: 3, borderRadius: 2, mt: 4 }}>
            <Typography variant="h6" mb={2}>📋 Payout Details</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}><TextField label="Title of the Payout" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={6}><TextField label="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={6}><TextField label="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={6}><TextField label="Total Beneficiary" type="number" value={beneficiaryCount} onChange={(e) => setBeneficiaryCount(e.target.value)} fullWidth /></Grid>
              <Grid item xs={12} md={6}><TextField label="Date" type="date" InputLabelProps={{ shrink: true }} value={date} onChange={(e) => setDate(e.target.value)} fullWidth /></Grid>
            </Grid>
          </Paper>

          {/* Payout Table */}
          {payouts.length > 0 && (
            <Paper sx={{ p: 3, borderRadius: 2, mt: 4 }}>
              <Typography variant="h6" mb={2}>📦 Payout Schedules</Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Title</TableCell>
                      <TableCell>Venue</TableCell>
                      <TableCell>Amount</TableCell>
                      <TableCell>Beneficiaries</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>File</TableCell>
                      <TableCell>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payouts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.title}</TableCell>
                        <TableCell>{p.venue}</TableCell>
                        <TableCell>₱{p.amount}</TableCell>
                        <TableCell>{p.beneficiaryCount}</TableCell>
                        <TableCell>{p.date}</TableCell>
                        <TableCell><strong style={{ color: "green" }}>{p.status}</strong></TableCell>
                        <TableCell>{p.fileName ? <a href={p.fileUrl} target="_blank" rel="noreferrer">{p.fileName}</a> : "—"}</TableCell>
                        <TableCell>
                          <IconButton color="error" onClick={() => handleDeletePayout(p.id)}><DeleteIcon /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </Box>

        <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
          <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))} sx={{ width: "100%" }}>{snack.message}</Alert>
        </Snackbar>
      </Box>
    </Box>
  );
}