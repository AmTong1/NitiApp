const fs = require('fs');
const docx = require('docx');

const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, VerticalAlign, AlignmentType } = docx;

function createCell(text, bold = false, rowspan = 1, align = AlignmentType.LEFT, widthPercent = null) {
    const opts = {
        rowSpan: rowspan,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 100, bottom: 100, left: 100, right: 100 },
        children: [
            new Paragraph({
                alignment: align,
                children: [
                    new TextRun({
                        text: text,
                        font: "TH Sarabun PSK",
                        size: 32, // 16pt (half-points)
                        bold: bold
                    })
                ]
            })
        ]
    };
    if (widthPercent) {
        opts.width = { size: widthPercent, type: WidthType.PERCENTAGE };
    }
    return new TableCell(opts);
}

function emptyCell() {
    return new TableCell({
        children: [
            new Paragraph({
                children: [new TextRun({ text: "", font: "TH Sarabun PSK", size: 32 })]
            })
        ]
    });
}

const rows = [];

rows.push(new TableRow({
    children: [
        createCell("ประเภทผู้ใช้งาน", true, 1, AlignmentType.CENTER, 20),
        createCell("หมวดระบบการใช้งาน", true, 1, AlignmentType.CENTER, 50),
        createCell("ผลลัพธ์ที่ได้", true, 1, AlignmentType.CENTER, 15),
        createCell("หมายเหตุ", true, 1, AlignmentType.CENTER, 15),
    ]
}));

rows.push(new TableRow({
    children: [
        createCell("ลูกบ้าน (Resident)", true, 16, AlignmentType.LEFT),
        createCell("1. ระบบบัญชีผู้ใช้และการตั้งค่า", true, 1),
        emptyCell(), emptyCell()
    ]
}));
rows.push(new TableRow({ children: [ createCell("1.1 เข้าสู่ระบบ/รีเซ็ตรหัสผ่าน"), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("1.2 แก้ไขข้อมูลส่วนตัว/ตั้งค่าบัญชี"), emptyCell(), emptyCell() ] }));

rows.push(new TableRow({ children: [ createCell("2. หน้าหลักและการแจ้งเตือน", true), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("2.1 แดชบอร์ด/สรุปยอดค้างชำระ"), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("2.2 รับ-แสดงการแจ้งเตือน/ประกาศ"), emptyCell(), emptyCell() ] }));

rows.push(new TableRow({ children: [ createCell("3. ระบบการชำระเงินและคิวอาร์โค้ด", true), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("3.1 สร้าง QR Code ชำระเงิน"), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("3.2 อัปโหลดสลิป/บันทึกประวัติ"), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("3.3 แสดงรอบบิล/สถานะค้างชำระ"), emptyCell(), emptyCell() ] }));

rows.push(new TableRow({ children: [ createCell("4. ระบบแจ้งซ่อมและประวัติ", true), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("4.1 แจ้งซ่อม/แนบรูปภาพ"), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("4.2 ติดตามสถานะ/ดูประวัติ"), emptyCell(), emptyCell() ] }));

rows.push(new TableRow({ children: [ createCell("5. ระบบสนทนาและการโทร", true), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("5.1 ส่งข้อความ/รูปภาพ"), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("5.2 โทรติดต่อผ่านแอป"), emptyCell(), emptyCell() ] }));

rows.push(new TableRow({
    children: [
        createCell("นิติบุคคล (Admin)", true, 4, AlignmentType.LEFT),
        createCell("6. ระบบจัดการลูกบ้านและการเงิน", true),
        emptyCell(), emptyCell()
    ]
}));
rows.push(new TableRow({ children: [ createCell("6.1 เพิ่ม/แก้ไข/ลบ ลูกบ้าน"), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("6.2 ตรวจสอบ/ยืนยันสลิป"), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("6.3 จัดการสถานะแจ้งซ่อม"), emptyCell(), emptyCell() ] }));

rows.push(new TableRow({
    children: [
        createCell("กรรมการบริหาร\n(Super Admin)", true, 9, AlignmentType.LEFT),
        createCell("7. แดชบอร์ดซุปเปอร์แอดมินและการอนุมัติ", true),
        emptyCell(), emptyCell()
    ]
}));
rows.push(new TableRow({ children: [ createCell("7.1 ดูแดชบอร์ดสรุปภาพรวม"), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("7.2 อนุมัติสิทธิ์/รายการสำคัญ"), emptyCell(), emptyCell() ] }));

rows.push(new TableRow({ children: [ createCell("8. ระบบตรวจสอบ Logs ย้อนหลัง", true), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("8.1 Logs การชำระเงิน"), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("8.2 Logs การแจ้งซ่อม"), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("8.3 Logs ลูกบ้าน"), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("8.4 Logs ประกาศ"), emptyCell(), emptyCell() ] }));
rows.push(new TableRow({ children: [ createCell("8.5 Export รายงานการเงิน"), emptyCell(), emptyCell() ] }));

const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows
});

const doc = new Document({
    sections: [{
        properties: {},
        children: [
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({
                        text: "บันทึกการทดสอบการยอมรับของผู้ใช้งาน (UAT) ครั้งที่ 1",
                        font: "TH Sarabun PSK",
                        size: 36, // 18pt
                        bold: true
                    })
                ]
            }),
            new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                    new TextRun({
                        text: "วัน/เดือน/ปี: .......................................................",
                        font: "TH Sarabun PSK",
                        size: 32, // 16pt
                    })
                ]
            }),
            new Paragraph({ children: [new TextRun("")] }), // Empty line
            table
        ]
    }]
});

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync("C:\\Users\\tanut\\Downloads\\UAT_Test_Report_v2.docx", buffer);
    console.log("DOCX generated successfully at C:\\Users\\tanut\\Downloads\\UAT_Test_Report_v2.docx");
}).catch(console.error);
