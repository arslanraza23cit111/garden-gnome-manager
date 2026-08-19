param(
  [Parameter(Mandatory = $true)]
  [string]$PrinterName,

  [Parameter(Mandatory = $true)]
  [string]$FilePath
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)]
        public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)]
        public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)]
        public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    private static Exception StepError(string step)
    {
        return new InvalidOperationException(step + " failed with Win32 error " + Marshal.GetLastWin32Error());
    }

    public static void SendFile(string printerName, string filePath)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero))
        {
            throw StepError("OpenPrinter for '" + printerName + "'");
        }

        DOCINFOA di = new DOCINFOA();
        di.pDocName = Path.GetFileName(filePath);
        di.pDataType = "RAW";

        bool docStarted = false;
        bool pageStarted = false;
        IntPtr unmanagedBytes = IntPtr.Zero;

        try
        {
            if (!StartDocPrinter(hPrinter, 1, di)) throw StepError("StartDocPrinter");
            docStarted = true;
            if (!StartPagePrinter(hPrinter)) throw StepError("StartPagePrinter");
            pageStarted = true;

            byte[] bytes = File.ReadAllBytes(filePath);
            unmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
            Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);

            int written;
            if (!WritePrinter(hPrinter, unmanagedBytes, bytes.Length, out written))
            {
                throw StepError("WritePrinter");
            }
            if (written != bytes.Length)
            {
                throw new IOException("WritePrinter wrote " + written + " of " + bytes.Length + " bytes.");
            }
        }
        finally
        {
            if (unmanagedBytes != IntPtr.Zero) Marshal.FreeCoTaskMem(unmanagedBytes);
            if (pageStarted && !EndPagePrinter(hPrinter)) throw StepError("EndPagePrinter");
            if (docStarted && !EndDocPrinter(hPrinter)) throw StepError("EndDocPrinter");
            if (!ClosePrinter(hPrinter)) throw StepError("ClosePrinter");
        }
    }
}
"@

if (!(Test-Path -LiteralPath $FilePath)) {
  throw "Raw print file not found: $FilePath"
}

[RawPrinterHelper]::SendFile($PrinterName, $FilePath)
Write-Output "OK"
