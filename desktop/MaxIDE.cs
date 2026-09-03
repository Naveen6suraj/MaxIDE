using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace MaxIDE.Desktop
{
    static class Program
    {
        private const string MutexName = "MaxIDE_Desktop_Instance_Mutex";
        private const string AppUrl = "http://127.0.0.1:3456";
        private static Process serverProcess = null;

        [STAThread]
        static void Main(string[] args)
        {
            bool createdNew;
            using (Mutex mutex = new Mutex(true, MutexName, out createdNew))
            {
                if (!createdNew)
                {
                    // Already running - open app window and exit
                    LaunchAppWindow();
                    return;
                }

                // 1. Ensure Background Runtime Server is Active
                EnsureServerRunning();

                // 2. Launch Native App Chrome Window
                LaunchAppWindow();
            }
        }

        static void EnsureServerRunning()
        {
            if (IsServerAlive())
            {
                return;
            }

            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                // Check dist/server/index.js or root
                string serverScript = Path.Combine(baseDir, "dist", "server", "index.js");
                if (!File.Exists(serverScript))
                {
                    // Look in parent directory if compiled in desktop/ or dist/
                    string parent = Directory.GetParent(baseDir).FullName;
                    string alt = Path.Combine(parent, "dist", "server", "index.js");
                    if (File.Exists(alt))
                    {
                        serverScript = alt;
                        baseDir = parent;
                    }
                }

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "node.exe",
                    Arguments = string.Format("\"{0}\"", serverScript),
                    WorkingDirectory = baseDir,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false,
                };

                serverProcess = Process.Start(psi);

                // Wait up to 10 seconds for server to be responsive
                for (int i = 0; i < 20; i++)
                {
                    Thread.Sleep(500);
                    if (IsServerAlive())
                    {
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not start MaxIDE background runtime: " + ex.Message,
                    "MaxIDE Runtime Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        static bool IsServerAlive()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(AppUrl + "/api/providers");
                request.Timeout = 1500;
                request.Method = "GET";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        static void LaunchAppWindow()
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
                string args = string.Format("--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1440,900 --app-id=MaxIDE", AppUrl, profileDir);
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
                    FileName = AppUrl,
                    UseShellExecute = true
                });
            }
        }
    }
}
