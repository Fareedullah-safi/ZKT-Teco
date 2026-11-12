Here is a simple, 4-step **`README.md`** file you can include with your folder or send to anyone who wants to run the scanner on their PC:

---

# 🖐️ ZK9500 Fingerprint Scanner Setup Guide

Follow these 4 quick steps to connect your local ZK9500 fingerprint reader to the web application.

---

### Step 1: Install Software Prerequisites (One-Time Setup)

1. **Plug in your ZK9500 USB Reader** to your Windows PC.
2. **Install ZKTeco USB Driver:** Install the official ZKTeco ZK9500 USB driver so Windows recognizes the reader.
3. **Install Java 8 (Adoptium Temurin JDK 8):**
   * Download and install JDK 8 using this link:  
     👉 [Download Java 8 (Adoptium JDK 8 MSI Installer)](https://adoptium.net/download?link=https%3A%2F%2Fgithub.com%2Fadoptium%2Ftemurin8-binaries%2Freleases%2Fdownload%2Fjdk8u512-b09%2FOpenJDK8U-jdk_x64_windows_hotspot_8u512b09.msi&vendor=Adoptium&checksum=77a730e65149c4cc426209672c7bd1b996ba6423e04c563c381ba083278cf165)

---

### Step 2: Start the Local Bridge Server

1. Extract `fingerprint-server.zip` on your computer.
2. Double-click **`run-server.bat`**.
3. Keep the terminal window **open** while using the application.

---

### Step 3: Get Your Secure Cloudflare URL

Once `run-server.bat` starts, look at the black terminal window. It will generate a secure link ending in **`trycloudflare.com`**:

https://abc.trycloudflare.com

**Copy that entire `https://...` link.**

---

### Step 4: Connect the Web App to Your Device

1. Open the live web application on Vercel (`https://your-app.vercel.app`).
2. Paste your copied `https://...trycloudflare.com` link into the **Scanner Bridge URL** input field at the top of the page.
3. Click **Check Reader**.
4. You will see **`Reader Connected! Found 1 device(s)`** and can now enroll and identify fingerprints!