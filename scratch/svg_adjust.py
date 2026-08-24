import re
import sys

svg = """
  <!-- Card -->
  <rect x="80" y="260" width="920" height="1380" rx="38" fill="#FFFFFF" filter="url(#shadow)"/>

  <!-- Header Stripe -->
  <rect x="80" y="260" width="920" height="30" rx="38" fill="#003399"/>
  <rect x="80" y="275" width="920" height="15" fill="#003399"/>

  <!-- Header Info -->
  <text x="152" y="380" font-family="Tahoma, sans-serif" font-size="48" font-weight="bold" fill="#003399">Payment</text>
  <text x="928" y="380" font-family="Tahoma, sans-serif" font-size="34" font-weight="bold" fill="#1a8a3a" text-anchor="end">ทำรายการสำเร็จ</text>

  <!-- Time Label -->
  <text x="152" y="450" font-family="Tahoma, sans-serif" font-size="32" fill="#6b6b6b">${escapeXml(dateText)}</text>

  <!-- Info Container Line -->
  <line x1="176" y1="530" x2="176" y2="850" stroke="#eeeeee" stroke-width="5"/>

  <!-- Node 1: From -->
  <circle cx="176" cy="530" r="14" fill="#003399"/>
  <circle cx="176" cy="530" r="18" fill="none" stroke="#003399" stroke-width="3"/>
  <text x="224" y="520" font-family="Tahoma, sans-serif" font-size="28" fill="#6b6b6b">จาก</text>
  <text x="224" y="570" font-family="Tahoma, sans-serif" font-size="38" font-weight="bold" fill="#2b2b2b">${escapeXml(payerText)}</text>
  <text x="224" y="615" font-family="Tahoma, sans-serif" font-size="34" fill="#6b6b6b">${escapeXml(senderBankText)}</text>

  <!-- Address Highlight -->
  <rect x="224" y="640" width="680" height="120" rx="19" fill="#f8faff"/>
  <rect x="224" y="640" width="10" height="120" rx="10" fill="#003399"/>
  <rect x="229" y="640" width="5" height="120" fill="#003399"/>
  <text x="260" y="685" font-family="Tahoma, sans-serif" font-size="28" font-weight="bold" fill="#003399">บ้านเลขที่</text>
  <text x="260" y="735" font-family="Tahoma, sans-serif" font-size="36" font-weight="bold" fill="#2b2b2b">${escapeXml(houseText)}</text>

  <!-- Node 2: To -->
  <circle cx="176" cy="850" r="14" fill="#003399"/>
  <circle cx="176" cy="850" r="18" fill="none" stroke="#003399" stroke-width="3"/>
  <text x="224" y="840" font-family="Tahoma, sans-serif" font-size="28" fill="#6b6b6b">ไปยัง</text>
  <text x="224" y="890" font-family="Tahoma, sans-serif" font-size="38" font-weight="bold" fill="#2b2b2b">${escapeXml(receiverText)}</text>
  <text x="224" y="935" font-family="Tahoma, sans-serif" font-size="34" fill="#6b6b6b">PromptPay ${escapeXml(promptPayMasked)}</text>

  <!-- Amount Container -->
  <line x1="152" y1="1020" x2="928" y2="1020" stroke="#dddddd" stroke-dasharray="10, 10" stroke-width="3"/>
  <text x="540" y="1100" font-family="Tahoma, sans-serif" font-size="28" fill="#6b6b6b" text-anchor="middle">จำนวนเงิน (บาท)</text>
  <text x="540" y="1190" font-family="Tahoma, sans-serif" font-size="86" font-weight="bold" fill="#003399" text-anchor="middle">${escapeXml(amountText)}</text>
  <text x="540" y="1250" font-family="Tahoma, sans-serif" font-size="34" fill="#6b6b6b" text-anchor="middle">ค่าธรรมเนียม: 0.00</text>

  <!-- Footer Ref -->
  <line x1="152" y1="1330" x2="928" y2="1330" stroke="#f0f0f0" stroke-width="3"/>
  <text x="152" y="1400" font-family="Tahoma, sans-serif" font-size="28" fill="#6b6b6b">เลขที่อ้างอิง: ${escapeXml(refText)}</text>
  <text x="152" y="1450" font-family="Tahoma, sans-serif" font-size="28" fill="#6b6b6b">ใบเสร็จ: ${escapeXml(receiptNo)}</text>
  <text x="152" y="1500" font-family="Tahoma, sans-serif" font-size="28" fill="#6b6b6b">โอนเงิน PromptPay</text>
  <text x="152" y="1560" font-family="Tahoma, sans-serif" font-size="28" font-weight="bold" fill="#ff6600">ตรวจสอบความถูกต้องได้ที่แอปฯ ธนาคาร</text>
"""

def replacer(m):
    attr = m.group(1)
    val = int(m.group(2))
    if attr in ['x', 'x1', 'x2', 'cx']: val -= 40
    elif attr in ['y', 'y1', 'y2', 'cy']: val -= 220
    return f'{attr}="{val}"'

new_svg = re.sub(r'(x|y|x1|y1|x2|y2|cx|cy)="(\d+)"', replacer, svg)
sys.stdout.write(new_svg)
