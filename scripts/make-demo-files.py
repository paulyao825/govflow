"""Generate SYNTHETIC upload packets for the GovFlow demo.

Layouts mirror a real 115年度青年AI工具補助 application packet (form + 領據 + 心得 + 自主檢核表 in one PDF,
USD invoices, credit-card statement for NTD amounts). Every person, ID, phone, email, address and
account number here is invented and marked 合成. Run:  python3 scripts/make-demo-files.py
"""
import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "demo-files")
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"
W, H = 1240, 1754  # A4 @150dpi


def f(size):
    return ImageFont.truetype(FONT, size)


class Page:
    def __init__(self):
        self.im = Image.new("RGB", (W, H), "white")
        self.d = ImageDraw.Draw(self.im)
        self.y = 90

    def title(self, *lines, size=40):
        for t in lines:
            w = self.d.textlength(t, font=f(size))
            self.d.text(((W - w) / 2, self.y), t, fill="black", font=f(size))
            self.y += size + 22
        self.y += 10

    def text(self, t, size=26, x=90, gap=14, color="black"):
        for line in t.split("\n"):
            self.d.text((x, self.y), line, fill=color, font=f(size))
            self.y += size + gap

    def table(self, rows, cols=(260, 900), size=26, pad=18):
        """rows: list of (label, value) — value may contain newlines."""
        x0 = 80
        for label, value in rows:
            lines = str(value).split("\n")
            h = max(1, len(lines)) * (size + 12) + pad * 2
            self.d.rectangle((x0, self.y, x0 + cols[0], self.y + h), outline="black", width=2)
            self.d.rectangle((x0 + cols[0], self.y, x0 + cols[0] + cols[1], self.y + h), outline="black", width=2)
            self.d.text((x0 + 16, self.y + pad), label, fill="black", font=f(size))
            yy = self.y + pad
            for ln in lines:
                self.d.text((x0 + cols[0] + 16, yy), ln, fill="black", font=f(size))
                yy += size + 12
            self.y += h
        self.y += 24

    def footer(self, n):
        self.d.text((W / 2 - 10, H - 80), str(n), fill="gray", font=f(20))


def scanned(im, angle=0.6, seed=1):
    """Make an image look like a phone scan: slight rotation, grey paper, blur, noise."""
    random.seed(seed)
    bg = Image.new("RGB", (im.width + 80, im.height + 80), (214, 211, 204))
    bg.paste(im, (40, 40))
    bg = bg.rotate(angle, resample=Image.BICUBIC, fillcolor=(190, 188, 182)).filter(ImageFilter.GaussianBlur(0.7))
    px = bg.load()
    for _ in range(9000):
        x, y = random.randrange(bg.width), random.randrange(bg.height)
        v = random.randrange(150, 230)
        px[x, y] = (v, v, v)
    return bg.resize((bg.width * 3 // 4, bg.height * 3 // 4))


def save_pdf(pages, path):
    ims = [p.im if isinstance(p, Page) else p for p in pages]
    ims[0].save(path, "PDF", save_all=True, append_images=ims[1:], resolution=150)


# ---------------------------------------------------------------- shared pages

def application_pdf(path, a):
    p1 = Page()
    p1.title("臺北市政府青年局", "115年度青年AI工具補助計畫申請書")
    p1.text("（測試用合成文件・非真實個人資料）", size=22, color="gray")
    p1.table(
        [
            ("申請人姓名", f"{a['name']}　　　電子信箱：{a['email']}"),
            ("身分證字號", f"{a['id']}（合成）　　連絡電話：{a['phone']}"),
            ("訂閱AI工具", f"{a['tool']}\n訂閱期間(8/1起)：{a['period']}"),
            ("計費方式", f"■月費：{a['fee']}\n□年費：每年　元、平均每月　元，申請　月，合計　元\n單位：新臺幣（以外幣購買者，另附信用卡帳單之新臺幣金額）"),
            ("檢附文件", a["checklist"]),
        ]
    )
    p1.footer(1)

    p2 = Page()
    p2.table(
        [
            (
                "注意事項",
                "1.本人確實於申請日時為十八歲以上至三十五歲，\n  已設籍臺北市六個月以上之青年。\n2.本人同意貴局依個人資料保護法規定蒐集、處理及利用。\n3.本人確認AI工具為個人購買及使用，如有偽造不實，\n  願負一切法律責任，並繳回溢領款項。\n此致　臺北市政府青年局\n\n申請人：" + a["name"] + "（簽章）\n中華民國 " + a["signed"],
            ),
        ]
    )
    p2.footer(2)

    p3 = Page()
    p3.title("領　　據")
    p3.text(f"茲領到臺北市政府青年局之青年AI工具補助新臺幣{a['amount_zh']}整。\n此　致\n臺北市政府青年局\n\n姓名：{a['name']}\n身分證字號：{a['id']}（合成）\n聯絡電話：{a['phone']}\n聯絡地址：{a['address']}\n中華民國 {a['signed']}", size=27)
    p3.y += 20
    p3.table([("存摺封面影本", f"■ {a['bank']}\n戶名：{a['name']}\n帳號：{a['account']}（合成）")])
    p3.footer(3)

    pages = [p1, p2, p3]
    for i, (tool, essay) in enumerate(a["essays"]):
        p = Page()
        p.title("AI工具使用心得")
        p.table([("申請人姓名", f"{a['name']}　　AI工具：{tool}"), ("使用目的", "■促進學習與學術輔助。■專業工作應用。\n■資訊檢索與資料蒐集。□娛樂與創意。")])
        p.text("使用心得（不含標點符號至少300字）", size=24)
        line, lines = "", []
        for ch in essay:
            line += ch
            if len(line) >= 38:
                lines.append(line)
                line = ""
        lines.append(line)
        p.text("\n".join(lines), size=25, gap=16)
        p.footer(4 + i)
        pages.append(p)

    p5 = Page()
    p5.title("臺北市政府青年局", "公職人員利益衝突迴避法-補助案件自主檢核表（申請人）", size=32)
    p5.table(
        [
            ("1", "申請人是否為本局或監督本局之利衝法所定之公職人員？　是□　否■"),
            ("2", "申請人是否為本局或監督本局之利衝法所定公職人員之關係人？　是□　否■"),
        ],
        cols=(80, 1080),
    )
    p5.text(f"申請人：{a['name']}\n本人簽名或蓋章：{a['name']}\n填表日期：{a['signed']}", size=26)
    p5.footer(len(pages) + 1)
    pages.append(p5)
    save_pdf(pages, path)


def openai_invoice(path, inv_no, date, period, to, usd=20.0):
    p = Page()
    p.d.text((90, 90), "OpenAI", fill="black", font=f(64))
    p.d.text((820, 90), "INVOICE", fill="gray", font=f(48))
    meta = f"Invoice #: {inv_no}\nInvoice date: {date}\nPeriod: {period}\nPlace: San Francisco, 1455 3rd Street"
    yy = 160
    for ln in meta.split("\n"):
        p.d.text((760, yy), ln, fill="gray", font=f(22))
        yy += 32
    p.y = 330
    p.text("Provided by:\nOpenAI OpCo, LLC\n1455 3rd Street, San Francisco 94158 US", size=24)
    p.text(f"Provided to:\n{to}\n（測試用合成文件）", size=24)
    p.y += 20
    p.table([("DESCRIPTION", "QUANTITY   PRICE   TAX   TOTAL"), (f"1 seat × ChatGPT Plus Subscription\n(at ${usd:.2f} / month)", f"1.0   {usd:.2f}   (5.00%) {usd*0.05:.2f}   USD {usd*1.05:.2f}"), ("Total", f"USD {usd*1.05:.2f}")], cols=(560, 600))
    save_pdf([p], path)


def card_statement(path, holder, bank, rows, month):
    p = Page()
    p.title(f"{bank}　信用卡月對帳單", size=36)
    p.text(f"（測試用合成文件）\n持卡人：{holder}　　卡號：****-****-****-0000\n帳單月份：{month}", size=24)
    p.y += 10
    p.table([("消費日", "交易說明　　　　　　　外幣金額　　新臺幣金額")] + rows, cols=(170, 990), size=24)
    p.text("※ 國外交易服務費另計，不列入補助金額。", size=22, color="gray")
    save_pdf([p], path)


def transcript(path, school, name, sid, courses):
    p = Page()
    p.title(school, "歷年成績單（中文）", size=36)
    p.text(f"（測試用合成文件）\n姓名：{name}　　學號：{sid}（合成）\n列印日期：2026/10/27", size=24)
    p.table([("課程名稱", "學分　　成績")] + [(c, f"{cr}　　　{g}") for c, cr, g in courses], cols=(560, 600), size=24)
    save_pdf([p], path)


def enrolment_png(path, school, name, dept, seed):
    p = Page()
    p.title(school, "在　學　證　明　書", size=42)
    p.text(f"（測試用合成文件）\n\n茲證明　{name}　君\n現就讀本校　{dept}\n115學年度第1學期　在學\n\n特此證明\n\n校長　（合成印）\n中華民國115年10月20日", size=30, gap=20)
    scanned(p.im, angle=0.8, seed=seed).save(path, "PNG", optimize=True)


def household_png(path, name, birth, moved_in, addr, seed):
    p = Page()
    p.title("戶　籍　謄　本（現戶部分）", size=40)
    p.text("（測試用合成文件）", size=24, color="gray")
    p.table([("姓名", name), ("出生日期", birth), ("住址", addr), ("遷入日期", moved_in), ("核發日期", "中華民國115年11月05日")], cols=(260, 900), size=28)
    scanned(p.im, angle=-0.7, seed=seed).save(path, "PNG", optimize=True)


def xai_invoice(path, to, date, ref):
    p = Page()
    p.d.text((90, 90), "Invoice", fill="black", font=f(60))
    p.d.text((820, 90), "X.AI LLC\n1450 PAGE MILL ROAD\nPALO ALTO", fill="black", font=f(22))
    p.y = 260
    p.text(f"Bill to\n{to}\n（測試用合成文件）", size=24)
    p.table([("Invoice reference", ref), ("Invoice date", date), ("Description", "Prepaid tokens"), ("Total in USD", "$15.00")], cols=(360, 800))
    save_pdf([p], path)


ESSAY_CHEN = (
    "我是國立臺灣大學公共事務研究所的學生，補助期間訂閱 ChatGPT Plus 個人方案，主要用在論文研究與研究助理工作。"
    "我的論文主題是地方政府數位服務的使用者體驗，需要閱讀大量中英文文獻與政府公開資料，過去光是整理一篇外文期刊就要花上一整個晚上。"
    "現在我會先自己讀摘要與研究方法，再請 ChatGPT 協助列出論證結構與關鍵變項，最後回到原文逐段核對，確保引用正確。"
    "在處理政府開放資料時，我請它協助撰寫資料清理的程式碼，並解釋每一個步驟的用意，讓我能自己修改與除錯。"
    "這段期間我也發現它偶爾會產生看似合理卻不存在的文獻，因此養成了每一筆引用都回到資料庫查證的習慣。"
    "整體而言這項工具讓我把時間花在思考研究問題，而不是重複的整理工作，未來希望把這些方法帶進公共部門的實務工作中。"
)
ESSAY_WANG = (
    "我是國立臺北科技大學資訊工程系四年級學生，補助期間訂閱 Claude Pro 個人方案，用來完成畢業專題與準備實習面試。"
    "我們的專題是校園無障礙路線導航系統，需要整合地圖資料、使用者回報與後端服務，程式規模不小。"
    "我會先自己設計模組架構，再請 Claude 檢查設計是否有遺漏的邊界情況，並協助撰寫單元測試，最後由我逐行閱讀後才合併。"
    "它也很擅長閱讀長篇文件，我把相關的開放資料規格交給它整理成欄位對照表，讓組員能快速理解資料格式。"
    "使用過程中我發現它偶爾會提出不存在的套件函式，所以每次都會回到官方文件確認。"
    "這段經驗讓我理解 AI 不是取代思考，而是讓我把力氣放在真正困難的問題上，也讓我在面試時能具體說明如何負責任地使用 AI 工具。"
)


def main():
    os.makedirs(OUT, exist_ok=True)

    # ---- Packet 1: 陳思妤 — realistic and messy (mirrors common real-world issues)
    d1 = os.path.join(OUT, "packet-1_陳思妤_messy")
    os.makedirs(d1, exist_ok=True)
    chen = dict(
        name="陳思妤", email="szuyu.chen@example.com", id="Z200000001", phone="0900-000-001",
        tool="ChatGPT Plus（OpenAI，個人月費方案）", period="115年8月10日至115年10月9日",
        fee="每月約676元，申請2月，合計1,350元（外幣，以信用卡帳單新臺幣金額為準）",
        checklist="1.■申請書。\n2.□新式戶口名簿影本或最近三個月內之戶籍謄本。\n3.■在學證明或115年度畢業證書。\n4.■AI課程修習證明。\n5.■AI工具訂閱紀錄及購買憑證。\n6.■領據正本及本人金融機構存摺封面影本\n7.■AI工具使用心得一篇。\n8.■補助案件自主檢核表。",
        signed="115年11月03日", amount_zh="壹仟參佰伍拾元", address="臺北市中正區範例路1號（合成）",
        bank="中華郵政", account="0000000-0000000", essays=[("ChatGPT Plus（OpenAI）", ESSAY_CHEN)],
    )
    application_pdf(os.path.join(d1, "01_申請書_陳思妤.pdf"), chen)
    openai_invoice(os.path.join(d1, "02_OpenAI_invoice_2026-08.pdf"), "SY10000001", "8/10/26", "August-September", "思妤 陳")
    openai_invoice(os.path.join(d1, "03_OpenAI_invoice_2026-09.pdf"), "SY10000002", "9/10/26", "September-October", "思妤 陳")
    openai_invoice(os.path.join(d1, "04_OpenAI_invoice_2026-10.pdf"), "SY10000003", "10/10/26", "October-November", "思妤 陳")
    xai_invoice(os.path.join(d1, "05_xAI_invoice.pdf"), "szu-yu chen\nszuyu.chen@example.com", "Oct 20, 2026", "SYNT-0000-0001")
    card_statement(
        os.path.join(d1, "06_信用卡帳單_2026-10.pdf"), "陳思妤", "範例銀行（合成）",
        [("08/10", "OPENAI *CHATGPT SUBSCR　USD 21.00　　NT$676"), ("09/10", "OPENAI *CHATGPT SUBSCR　USD 21.00　　NT$674"), ("10/10", "OPENAI *CHATGPT SUBSCR　USD 21.00　　NT$672"), ("10/20", "X.AI LLC　　　　　　　　USD 15.00　　NT$483")],
        "2026年10月",
    )
    transcript(os.path.join(d1, "07_成績單.pdf"), "國立臺灣大學", "陳思妤", "R14000001", [("人工智慧導論", 3, "A-"), ("公共政策分析", 3, "A"), ("計量方法", 3, "B+")])
    enrolment_png(os.path.join(d1, "08_在學證明_手機掃描.png"), "國立臺灣大學", "陳思妤", "公共事務研究所 碩士班二年級", seed=3)
    # correction the applicant sends later (戶籍謄本 was missing)
    household_png(os.path.join(OUT, "packet-1_補件_陳思妤_戶籍謄本.png"), "陳思妤", "民國90年5月12日", "民國105年3月1日", "臺北市中正區範例路1號（合成）", seed=5)

    # ---- Packet 2: 王柏翰 — complete and tidy
    d2 = os.path.join(OUT, "packet-2_王柏翰_complete")
    os.makedirs(d2, exist_ok=True)
    wang = dict(
        name="王柏翰", email="pohan.wang@example.com", id="Z100000002", phone="0900-000-002",
        tool="Claude Pro（Anthropic，個人月費方案）", period="115年8月20日至115年10月19日",
        fee="每月約675元，申請2月，合計1,350元（外幣，以信用卡帳單新臺幣金額為準）",
        checklist="1.■申請書。\n2.■新式戶口名簿影本或最近三個月內之戶籍謄本。\n3.■在學證明或115年度畢業證書。\n4.■AI課程修習證明。\n5.■AI工具訂閱紀錄及購買憑證。\n6.■領據正本及本人金融機構存摺封面影本\n7.■AI工具使用心得一篇。\n8.■補助案件自主檢核表。",
        signed="115年11月04日", amount_zh="壹仟參佰伍拾元", address="臺北市大同區範例街2號（合成）",
        bank="臺灣銀行", account="000-000-000000", essays=[("Claude Pro（Anthropic）", ESSAY_WANG)],
    )
    application_pdf(os.path.join(d2, "01_申請書_王柏翰.pdf"), wang)
    household_png(os.path.join(d2, "02_戶籍謄本.png"), "王柏翰", "民國92年9月3日", "民國98年7月1日", "臺北市大同區範例街2號（合成）", seed=7)
    enrolment_png(os.path.join(d2, "03_在學證明.png"), "國立臺北科技大學", "王柏翰", "資訊工程系 四年級", seed=9)
    transcript(os.path.join(d2, "04_成績單.pdf"), "國立臺北科技大學", "王柏翰", "111590000", [("生成式AI應用實務", 3, "A"), ("資料結構", 3, "A-")])
    card_statement(
        os.path.join(d2, "05_信用卡帳單_Anthropic.pdf"), "王柏翰", "範例銀行（合成）",
        [("08/20", "ANTHROPIC CLAUDE PRO　USD 21.00　　NT$675"), ("09/20", "ANTHROPIC CLAUDE PRO　USD 21.00　　NT$675")],
        "2026年09月",
    )
    print("written to", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
