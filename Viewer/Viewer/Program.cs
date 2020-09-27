using System;
using System.Windows.Forms;
using System.IO;

namespace Viewer
{
    static class Program
    {
        /// <summary>
        /// The main entry point for the application.
        /// </summary>
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            using (StreamWriter writer = new StreamWriter("console.txt"))
            {
                Console.SetOut(writer);
                Console.WriteLine("Test line");
                ViewerForm viewerForm = new ViewerForm();
                try
                {
                    viewerForm.setWindowParametersFromCommandLineArguments(args);
                    Application.Run(viewerForm);
                }
                catch (Exception e)
                {
                    Console.WriteLine("Got Exception running render thread: {0} exiting", e);
                    Application.Exit();
                }
            }
        }
    }
}
