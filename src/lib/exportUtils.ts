import * as XLSX from "xlsx";

/**
 * Exports data to an Excel file with multiple sheets.
 * @param sheets An object where keys are sheet names and values are arrays of objects (data rows).
 * @param filename The name of the file to download (without extension).
 */
export const exportToExcel = (sheets: { [sheetName: string]: any[] }, filename: string) => {
    const wb = XLSX.utils.book_new();

    Object.entries(sheets).forEach(([sheetName, data]) => {
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, `${filename}.xlsx`);
};

/**
 * Exports data to a CSV file.
 * @param data An array of objects to export.
 * @param filename The name of the file to download (without extension).
 */
export const exportToCsv = (data: any[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);

    // Create a Blob and trigger download
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
