using System;
using System.Text;
using System.Windows.Forms;
using System.IO;
using System.Timers;
using System.Runtime.InteropServices;
using System.Threading;
using AxisMediaViewerLib;
using Newtonsoft.Json.Linq;

namespace Viewer
{
    public partial class ViewerForm : Form
    {
        private static Thread renderThread;

        private static System.Timers.Timer timer;

        private string videoDirPath = "";
        private string videoPath = "";

        private int WindowXPos = 0;
        private int WindowYPos = 0;
        private int WindowWidth = -1;
        private int WindowHeight = -1;

        private static int VideoXPos = 0;
        private static int VideoYPos = 0;
        private static int VideoWidth = -1;
        private static int VideoHeight = -1;

        public ViewerForm()
        {
            InitializeComponent();

            // set the border style, position and size  of the form
            FormBorderStyle = FormBorderStyle.None;

            // Create a thread for rendering the video content.
            renderThread = new Thread(new ParameterizedThreadStart(RenderThread));
            renderThread.SetApartmentState(ApartmentState.MTA);
            renderThread.Start(this.Handle);

            timer = new System.Timers.Timer(8000);
            timer.Interval = 2000;
            timer.Elapsed += OnTimedEvent;
            timer.AutoReset = true;
            timer.Enabled = true;
        }

        private void OnTimedEvent(Object source, ElapsedEventArgs e)
        {
            Activate();
        }

        public void setWindowParametersFromCommandLineArguments(string[] args)
        {
            for (int i = 0; i < args.Length; i++)
            {
                Console.WriteLine(args[i]);
            }
            // Look at our arguments
            for (int i = 0; i < args.Length; i++)
            {
                // Check if we are recieving the name of an argument
                if (args[i].Substring(0, 2) == "--")
                {
                    // We got a real argument!
                    switch (args[i])
                    {
                        case "--data-path":
                            videoDirPath = args[++i];
                            break;
                        case "--window-x":
                            if (!int.TryParse(args[++i], out WindowXPos))
                            {
                                Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                                WindowXPos = 0;
                            }
                            break;
                        case "--window-y":
                            if(!int.TryParse(args[++i], out WindowYPos))
                            {
                                Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                                WindowYPos = 0;
                            }
                            break;
                        case "--window-width":
                            if (!int.TryParse(args[++i], out WindowWidth))
                            {
                                Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                                WindowWidth = 1920;
                            }
                            break;
                        case "--window-height":
                            if (!int.TryParse(args[++i], out WindowHeight))
                            {
                                Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                                WindowHeight = 1080;
                            }
                            break;
                        case "--video-width":
                            if (!int.TryParse(args[++i], out VideoWidth))
                            {
                                Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                                VideoWidth = 1920;
                            }
                            break;
                        case "--video-height":
                            if (!int.TryParse(args[++i], out VideoHeight))
                            {
                                Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                                VideoWidth = 1080;
                            }
                            break;
                        case "--video-x":
                            if (!int.TryParse(args[++i], out VideoXPos))
                            {
                                Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                                VideoXPos = 0;
                            }
                            break;
                        case "--video-y":
                            if (!int.TryParse(args[++i], out VideoYPos))
                            {
                                Console.WriteLine("Failed to parse: " + args[i] + " to integer, default set");
                                VideoYPos = 0;
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
                    Console.WriteLine("Malformed Command: " + args[i] + ",\n Arguments must be preceded by -- and succeeded by their argument");
                }
            }

            setWindowParameters();
            setDataParameters();

            if(videoPath == "")
            {
                Console.WriteLine("Invalid video path, no video found within video directory {0} exiting...", videoDirPath);
                Environment.Exit(1);
            }
            if(WindowWidth < 0)
            {
                Console.WriteLine("Window Width has not been initialized, or has been given a negative value. Setting default value: 1920");
                WindowWidth = 3840;
            }
            if (WindowHeight < 0)
            {
                Console.WriteLine("Window Height has not been initialized, or has been given a negative value. Setting default value: 1080");
                WindowHeight = 2160;
            }
            if (VideoWidth < 0)
            {
                Console.WriteLine("Video Width has not been initialized, or has been given a negative value. Setting default value: 1920");
                VideoWidth = 3840;
            }
            if (VideoWidth < 0)
            {
                Console.WriteLine("Video Height has not been initialized, or has been given a negative value. Setting default value: 1080");
                VideoHeight = 2160;
            }
        }

        private void setWindowParameters()
        {
            Location = new System.Drawing.Point(WindowXPos, WindowYPos);
            ClientSize = new System.Drawing.Size(WindowWidth, WindowHeight);
        }

        private void setDataParameters()
        {
            videoPath = getVideoFilePathFromVideoDirPath(videoDirPath);
        }

        void RenderThread(object obj)
        {
            IntPtr hWnd = (IntPtr)obj;

            while (true)
            {
                AxisMediaViewer viewer = new AxisMediaViewer();
                viewer.VMR9 = true;

                FileStream inFileStream = new FileStream(videoPath, FileMode.Open);
                BinaryReader inFile = new BinaryReader(inFileStream, Encoding.UTF32);
                if (inFile.PeekChar() != -1)
                {
                    int mediaTypeSize = inFile.ReadInt32();
                    byte[] mediaTypeBuffer = inFile.ReadBytes(mediaTypeSize);

                    try
                    {
                        viewer.Init(1, mediaTypeBuffer, hWnd.ToInt64());
                    }
                    catch(Exception e)
                    {
                        Console.WriteLine("Got Exception:\n" + e);
                        viewer.VMR9 = false;
                        viewer.Init(1, mediaTypeBuffer, hWnd.ToInt64());
                    }

                    viewer.SetVideoPosition(VideoXPos, VideoYPos, VideoXPos + VideoWidth, VideoYPos + VideoHeight);


                    viewer.Start();

                    Console.WriteLine("Status: " + viewer.Status);

                    while (inFile.PeekChar() != -1)
                    {
                        // Read frame data
                        int sampleType = inFile.ReadInt32();
                        int sampleFlags = inFile.ReadInt32();
                        ulong startTime = inFile.ReadUInt64();
                        ulong stopTime = inFile.ReadUInt64();
                        int bufferSize = inFile.ReadInt32();
                        byte[] bufferBytes = inFile.ReadBytes(bufferSize);
                        // Check that it’s not an audio sample.
                        if (sampleType != (int)AMV_VIDEO_SAMPLE_TYPE.AMV_VST_MPEG4_AUDIO)
                        {
                            // Let the viewer render the frame
                            viewer.RenderVideoSample(sampleFlags, startTime, stopTime, bufferBytes);
                        }
                    }

                    viewer.Stop();

                    inFileStream.Close();
                    inFile.Close();
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
            return files[0];
        }
    }
}
