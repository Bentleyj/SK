using System;
using System.Text;
using System.IO;
using System.Runtime.InteropServices;
using AXISFILEWRITERLib;
using AxisMediaParserLib;

namespace asfWriter
{
    class Program
    {
        private static string srcPath = "";
        private static string dstPath = "";

        static void writeFiles(ulong sectionStartTime, int suffix)
        {
            AxisFileWriter writer = new AxisFileWriter();
            ulong lastSuccessfulStartTime = sectionStartTime;
            try
            {
                // Open bin file
                using (FileStream inFileStream = new FileStream(srcPath, FileMode.Open))
                using (BinaryReader inFile = new BinaryReader(inFileStream, Encoding.UTF32))
                {
                    int mediaTypeSize = inFile.ReadInt32();
                    byte[] mediaTypeBuffer = inFile.ReadBytes(mediaTypeSize);

                    writer.BeginRecord(dstPath + "_" + suffix.ToString() + ".asf", mediaTypeBuffer);

                    while (inFile.PeekChar() != -1)
                    {
                        int sampleType = inFile.ReadInt32();
                        int sampleFlags = inFile.ReadInt32();
                        ulong startTime = inFile.ReadUInt64();
                        ulong stopTime = inFile.ReadUInt64();
                        int bufferSize = inFile.ReadInt32();
                        byte[] bufferBytes = inFile.ReadBytes(bufferSize);
                        if (startTime < sectionStartTime)
                            continue;

                        Console.WriteLine("type {0}, flages {1}, start {2}, size {3}", sampleType, sampleFlags, startTime, bufferSize);
                        AFW_STREAM_TYPE streamType;
                        if (sampleType == (int)AMP_VIDEO_SAMPLE_TYPE.AMP_VST_MPEG4_AUDIO)
                        {
                            streamType = AFW_STREAM_TYPE.AFW_ST_AUDIO;
                        }
                        else
                        {
                            streamType = AFW_STREAM_TYPE.AFW_ST_VIDEO;
                        }
                        writer.WriteStreamSample((ushort)streamType, startTime, 0, bufferBytes);
                        lastSuccessfulStartTime = startTime;
                    }

                    writer.EndRecording();
                    Console.WriteLine("Done");
                    Marshal.FinalReleaseComObject(writer);
                    writer = null;
                    Console.ReadLine();
                }
            }
            catch (COMException e)
            {
                Console.WriteLine("Error Writing Stream {0}. Attempting to start new writer...", e.Message);
                try
                {
                    writer.EndRecording();
                    Marshal.FinalReleaseComObject(writer);
                    writer = null;
                }
                catch (COMException e2)
                {
                    Console.WriteLine("Error Creating New Stream {0}. Exiting.", e.Message);
                }

                writeFiles( lastSuccessfulStartTime, ++suffix);

            }
        }

        static void Main(string[] args)
        {

            for(int i = 0; i < args.Length; i++)
            {
                // Check if we are recieving the name of an argument
                if(args[i].Substring(0,2) == "--")
                {
                    // We got a real argument!
                    switch (args[i])
                    {
                        case "--src-path":
                            srcPath = args[++i];
                            break;
                        case "--dst-path":
                            dstPath = args[++i];
                            break;
                        default:
                            Console.WriteLine("Unknown Command: " + args[i] + " With argument: " + args[++i]);
                            break;
                    }
                }
                else
                {
                    // We did not get a real argument!
                    Console.WriteLine("Malformed Command: " + args[i] + ",\n Arguments must be preceded by -- and succeeded by their argument. ignoring this argument...");
                }
            }
            writeFiles( 0, 0);
        }
    }
}
