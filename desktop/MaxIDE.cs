using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace MaxIDE.Desktop
{
    static class Program
    {
        private const string MutexName = "MaxIDE_Desktop_Instance_Mutex";
        private const string DefaultAppUrl = "http://127.0.0.1:3456";
        private static string resolvedAppUrl = DefaultAppUrl;
        private static Process serverProcess = null;

        [STAThread]
        static void Main(string[] args)
        {
            bool createdNew;
            using (Mutex mutex = new Mutex(true, MutexName, out createdNew))
            {
                if (!createdNew)
                {
                    // Already running - open app window to existing healthy instance and exit
                    resolvedAppUrl = DetectRunningAppUrl();
                    LaunchAppWindow(resolvedAppUrl);
                    return;
                }

                // 1. Ensure Background Runtime Server is Active and Healthy
                bool started = EnsureServerRunning();
                if (!started)
                {
                    return;
                }

                // 2. Launch Native App Chrome Window
                LaunchAppWindow(resolvedAppUrl);
            }
        }

        private static string GetRuntimePortFile()
        {
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(localAppData, "MaxIDE", "runtime", "port.json");
        }

        private static string DetectRunningAppUrl()
        {
            try
            {
                string portFile = GetRuntimePortFile();
                if (File.Exists(portFile))
                {
                    string json = File.ReadAllText(portFile);
                    Match m = Regex.Match(json, "\"url\":\\s*\"([^\"]+)\"");
                    if (m.Success)
                    {
                        string candidateUrl = m.Groups[1].Value;
                        if (IsServerAlive(candidateUrl))
                        {
                            return candidateUrl;
                        }
                    }
                }
            }
            catch {}

            if (IsServerAlive(DefaultAppUrl))
            {
                return DefaultAppUrl;
            }

            return DefaultAppUrl;
        }

        private static string FindNodeExecutable(string baseDir)
        {
            // 1. Check bundled node in app base directory
            string localNode = Path.Combine(baseDir, "node.exe");
            if (File.Exists(localNode)) return localNode;

            // 2. Check bundled node in runtime subdirectory
            string runtimeNode = Path.Combine(baseDir, "runtime", "node.exe");
            if (File.Exists(runtimeNode)) return runtimeNode;

            // 3. Check parent directory (for dev layout dist/MaxIDE.exe)
            DirectoryInfo pInfo = Directory.GetParent(baseDir);
            string parent = pInfo != null ? pInfo.FullName : null;
            if (parent != null)
            {
                string parentNode = Path.Combine(parent, "node.exe");
                if (File.Exists(parentNode)) return parentNode;
                string parentRuntimeNode = Path.Combine(parent, "runtime", "node.exe");
                if (File.Exists(parentRuntimeNode)) return parentRuntimeNode;
            }

            // 4. Check system PATH
            string pathEnv = Environment.GetEnvironmentVariable("PATH");
            if (pathEnv != null)
            {
                foreach (string p in pathEnv.Split(';'))
                {
                    string trimmed = p.Trim();
                    if (!string.IsNullOrEmpty(trimmed))
                    {
                        string candidate = Path.Combine(trimmed, "node.exe");
                        if (File.Exists(candidate)) return candidate;
                    }
                }
            }

            return "node.exe";
        }

        static bool EnsureServerRunning()
        {
            // Check if already alive
            resolvedAppUrl = DetectRunningAppUrl();
            if (IsServerAlive(resolvedAppUrl))
            {
                return true;
            }

            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string serverScript = Path.Combine(baseDir, "dist", "server", "index.js");
                if (!File.Exists(serverScript))
                {
                    DirectoryInfo pInfo2 = Directory.GetParent(baseDir);
                    string parent = pInfo2 != null ? pInfo2.FullName : null;
                    if (parent != null)
                    {
                        string alt = Path.Combine(parent, "dist", "server", "index.js");
                        if (File.Exists(alt))
                        {
                            serverScript = alt;
                            baseDir = parent;
                        }
                    }
                }

                if (!File.Exists(serverScript))
                {
                    MessageBox.Show(
                        "MaxIDE server script not found at:\n" + serverScript + "\n\nPlease reinstall or rebuild MaxIDE.",
                        "MaxIDE Launch Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return false;
                }

                string nodeExe = FindNodeExecutable(baseDir);

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = string.Format("\"{0}\"", serverScript),
                    WorkingDirectory = baseDir,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false,
                };

                serverProcess = Process.Start(psi);

                // Wait up to 15 seconds for server to be responsive
                for (int i = 0; i < 30; i++)
                {
                    Thread.Sleep(500);
                    resolvedAppUrl = DetectRunningAppUrl();
                    if (IsServerAlive(resolvedAppUrl))
                    {
                        return true;
                    }
                }

                MessageBox.Show(
                    "MaxIDE background runtime started, but did not become ready within 15 seconds.\nCheck %LOCALAPPDATA%\\MaxIDE\\logs for details.",
                    "MaxIDE Startup Timeout", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not start MaxIDE background runtime: " + ex.Message,
                    "MaxIDE Runtime Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
            }
        }

        static bool IsServerAlive(string url)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url + "/api/health");
                request.Timeout = 1200;
                request.Method = "GET";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    if (response.StatusCode == HttpStatusCode.OK)
                    {
                        using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                        {
                            string body = reader.ReadToEnd();
                            return body.Contains("\"MaxIDE\"");
                        }
                    }
                    return false;
                }
            }
            catch
            {
                return false;
            }
        }

        static void LaunchAppWindow(string url)
        {
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string profileDir = Path.Combine(localAppData, "MaxIDE", "AppProfile");
            if (!Directory.Exists(profileDir))
            {
                Directory.CreateDirectory(profileDir);
            }

            string[] edgePaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(localAppData, @"Microsoft\Edge\Application\msedge.exe"),
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
            };

            string edgeExe = null;
            foreach (string p in edgePaths)
            {
                if (File.Exists(p))
                {
                    edgeExe = p;
                    break;
                }
            }

            if (edgeExe != null)
            {
                string args = string.Format("--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1440,900 --app-id=MaxIDE", url, profileDir);
                Process.Start(new ProcessStartInfo
                {
                    FileName = edgeExe,
                    Arguments = args,
                    UseShellExecute = true
                });
            }
            else
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
        }
    }
}
