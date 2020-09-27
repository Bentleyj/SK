using System;
using System.Text;
using System.Windows.Forms;
using System.IO;
using System.Threading;
using AxisMediaViewerLib;

namespace Viewer
{
    public partial class ViewerForm : Form
    {
        private static Thread m_renderThread;

        private string m_videoPath = "";

        private int m_windowXPos = 0;
        private int m_windowYPos = 0;
        private int m_windowWidth = 3840;
        private int m_windowHeight = 2160;

        private static int m_videoXPos = 0;
        private static int m_videoYPos = 0;
        private static int m_videoWidth = 3840;
        private static int m_videoHeight = 2160;

        public ViewerForm()
        {
            InitializeComponent();

            // set the border style, position and size  of the form
            FormBorderStyle = FormBorderStyle.None;

            Console.WriteLine("Test Output");

            Activate();
        }

        ~ViewerForm()
        {
            m_renderThread.Abort();
        }
        private void ViewerForm_FormClosed(object sender, FormClosedEventArgs e)
        {
            m_renderThread.Abort();
        }

        public void setWindowParametersFromCommandLineArguments(string[] args)
        {
            // Look at our arguments
            for (int i = 0; i < args.Length; i++)
            {
                Console.WriteLine("Found argument: {0}", args[i]);

                // Check if we are recieving the name of an argument
                if (args[i].Substring(0, 2) == "--")
                {
                    // We got a real argument!
                    switch (args[i])
                    {
                    case "--data-path":
                        m_videoPath = getVideoFilePathFromVideoDirPath(args[++i]);
                        break;
                    case "--window-x":
                        if (!int.TryParse(args[++i], out m_windowXPos))
                        {
                            Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                        }
                        break;
                    case "--window-y":
                        if(!int.TryParse(args[++i], out m_windowYPos))
                        {
                            Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                        }
                        break;
                    case "--window-width":
                        if (!int.TryParse(args[++i], out m_windowWidth))
                        {
                            Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                        }
                        break;
                    case "--window-height":
                        if (!int.TryParse(args[++i], out m_windowHeight))
                        {
                            Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                        }
                        break;
                    case "--video-x":
                        if (!int.TryParse(args[++i], out m_videoXPos))
                        {
                            Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                        }
                        break;
                    case "--video-y":
                        if (!int.TryParse(args[++i], out m_videoYPos))
                        {
                            Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                        }
                        break;
                    case "--video-width":
                        if (!int.TryParse(args[++i], out m_videoWidth))
                        {
                            Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                        }
                        break;
                    case "--video-height":
                        if (!int.TryParse(args[++i], out m_videoHeight))
                        {
                            Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                        }
                        break;
                    default:
                        Console.WriteLine("Unknown Command: " + args[i] + " With argument: " + args[++i]);
                        break;
                    }
                }
                else
                {
                    // We did not get a real argument!
                    Console.WriteLine("Malformed Command: " + args[i] + ",\n Arguments must be preceded by -- and succeeded by their value");
                }
            }

            Location = new System.Drawing.Point(m_windowXPos, m_windowYPos);
            ClientSize = new System.Drawing.Size(m_windowWidth, m_windowHeight);
        }

        void RenderThread(object obj)
        {
            using (StreamWriter writer = new StreamWriter("consoleThread.txt"))
            {
                Console.SetOut(writer);
                try
                {
                    renderThreadDoUpdate(obj);
                }
                catch (Exception e)
                {
                    Console.WriteLine(e.Message);
                    Application.Exit();
                }
            }
        }

        void renderThreadDoUpdate(object obj)
        {
            if (!File.Exists(m_videoPath))
            {
                Console.WriteLine("startRenderThread: Could not find file {0}, exiting", m_videoPath);
                throw new Exception("File Not Found");
            }

            using (FileStream inFileStream = new FileStream(m_videoPath, FileMode.Open, FileAccess.Read))
            {
                using (BinaryReader inFile = new BinaryReader(inFileStream, Encoding.UTF32))
                {
                    if (inFile.PeekChar() == -1)
                    {
                        Console.WriteLine("startRenderThread: file {0} is empty, exiting", m_videoPath);
                        throw new Exception("File is Empty");
                    }

                    IntPtr hWnd = (IntPtr)obj;
                    int mediaTypeSize = inFile.ReadInt32();
                    byte[] mediaTypeBuffer = inFile.ReadBytes(mediaTypeSize);
                    long headerOffset = inFileStream.Position; // save the width of the header so we don't read it again.

                    while (true)
                    {

                        AxisMediaViewer viewer = new AxisMediaViewer();
                        viewer.VMR9 = true;

                        try
                        {
                            viewer.Init(0, mediaTypeBuffer, hWnd.ToInt64());
                        }
                        catch (Exception e)
                        {
                            Console.WriteLine("Got Exception initializing player: {0} exiting", e);
                            throw new Exception("Failed to Initialize Player");
                        }

                        viewer.SetVideoPosition(m_videoXPos, m_videoYPos, m_videoXPos + m_videoWidth, m_videoYPos + m_videoHeight);
                        viewer.Start();

                        while (inFile.PeekChar() != -1)
                        {
                            // Read frame data
                            int sampleType = inFile.ReadInt32();
                            int sampleFlags = inFile.ReadInt32();
                            ulong startTime = inFile.ReadUInt64();
                            ulong stopTime = inFile.ReadUInt64();
                            int bufferSize = inFile.ReadInt32();
                            byte[] bufferBytes = inFile.ReadBytes(bufferSize);

                            if (sampleType != (int)AMV_VIDEO_SAMPLE_TYPE.AMV_VST_MPEG4_AUDIO && bufferSize > 0)
                            {
                                try
                                {
                                    viewer.RenderVideoSample(sampleFlags, startTime, stopTime, bufferBytes);
                                }
                                catch (Exception e)
                                {
                                    Console.WriteLine("Caught Exception {0} when trying to render frame.", e);
                                }
                            }
                        }

                        inFileStream.Position = headerOffset;
                        viewer.Stop();
                    }
                }
            }
        }

        string getVideoFilePathFromVideoDirPath(string videoDirPath)
        {
            string[] files = Directory.GetFiles(videoDirPath, "*.bin");

            if(files.Length == 1)
            {
                return files[0];
            }
            // If we have no or multiple videos so we need to exit now.
            Console.WriteLine("There were " + files.Length + " videos in the specified video directory: " + videoDirPath + " Selecting First one: " + files[0]);
            throw new Exception("No files found");
        }

        private void ViewerForm_Load(object sender, EventArgs e)
        {
            // Create a thread for rendering the video content.
            m_renderThread = new Thread(new ParameterizedThreadStart(RenderThread));
            m_renderThread.SetApartmentState(ApartmentState.MTA);

            m_renderThread.Start(this.Handle);
        }
    }
}
