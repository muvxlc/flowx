# วิจัย: ส่วนขยายแนว Meta x Vibes Automator + Jev

ตรวจข้อมูล: 28 กันยายน 2026 · ขอบเขต: วิจัยเท่านั้น ยังไม่สร้างส่วนขยายหรือเชื่อม API จริง

## ข้อสรุป

ทำผลิตภัณฑ์แนว **คิวงานสร้างภาพ/วิดีโอ + ประเมินงานด้วย Jev** ได้ในเชิงออกแบบ แต่ยังยืนยันไม่ได้ว่า `vibes.ai` อนุญาตให้ส่ง prompt จำนวนมากผ่านการควบคุมหน้าเว็บ หรือมี API สาธารณะสำหรับงานนี้ อย่าเริ่มจากการทำบอตคลิกหน้าเว็บหรือเลี่ยงข้อจำกัดบริการ ก่อนตรวจข้อกำหนดและช่องทาง integration ของแพลตฟอร์มเป้าหมาย [1][2]

**ชื่อ “Meta x Vibes” ไม่ใช่คำสั่งให้เชื่อม X/Twitter**: หน้า Chrome Web Store ระบุชัดว่าเครื่องมือทำ bulk image/video generation บน `vibes.ai` ไม่ได้ระบุการโพสต์บน `x.com` [1] กฎ X ที่ตรวจแยกไว้ด้านล่างใช้เฉพาะกรณีต้องการเพิ่มการเผยแพร่บน X จริงเท่านั้น [10]

## สิ่งที่ต้นแบบโฆษณา

| ความสามารถ | หลักฐาน | สถานะหลักฐาน |
|---|---|---|
| รับรายการ prompt และเรียงคิวงานสร้างภาพ/วิดีโอ | รายการฟีเจอร์ใน Store และคู่มือผู้พัฒนา [1][2] | **คำโฆษณา/คู่มือ**; ยังไม่ได้ติดตั้งทดสอบ |
| Text-to-image, text-to-video, image-to-video และจับคู่รูปกับ prompt | Store และคู่มือโหมด Single/Paired [1][2] | **คำโฆษณา/คู่มือ** |
| จัดคิว ผสมงานภาพ/วิดีโอ แก้/เรียงลำดับ หยุด/ทำต่อ และดาวน์โหลดผลลัพธ์ | Store และคู่มือผู้พัฒนา [1][2] | **คำโฆษณา/คู่มือ** |
| ตัวช่วยสร้าง prompt ในส่วนขยาย | Store [1] | **คำโฆษณา**; วิธีสร้างและโมเดลที่ใช้ยังไม่ยืนยัน |
| ส่วนขยาย ID `caphdchhomcgjlligpbbjmmfcpkelkmm`, เวอร์ชัน `2.0.0`, ผู้เผยแพร่ `autoplaylabs.com` | Chrome Web Store [1] | **ยืนยันจากหน้ารายการ** ณ วันตรวจ |

คู่มือผู้พัฒนายังใช้ชื่อ “Meta Automator” และอธิบายการทำงานบน Meta AI ขณะที่หน้ารายการล่าสุดกล่าวถึง `vibes.ai`; **เอกสารสองหน้ามีความคลาดเคลื่อนเรื่องเป้าหมายปัจจุบัน** จึงต้องยืนยันกับเจ้าของแพลตฟอร์ม/ทดสอบแบบได้รับอนุญาตก่อนออกแบบตัวเชื่อมจริง [1][2] เราไม่ได้ตรวจ manifest, source code, DOM, โควตา, ราคา subscription หรือพฤติกรรมจริงของส่วนขยาย; ไม่ควรอ้างว่า permission, backend, OAuth หรือเทคนิคดาวน์โหลดใดเป็นข้อเท็จจริงจากหน้ารายการเพียงอย่างเดียว [1]

## Jev ใช้ตรงไหน

TypeSafe อธิบาย Jev ว่าเป็น System One Model: รับ state แบบข้อความ/ข้อมูลมีโครงสร้าง แล้วตอบเป็นการตัดสินใจแบบ typed พร้อมความเชื่อมั่น ไม่สร้างข้อความอิสระ จึง **ไม่ใช่ตัวสร้าง prompt, ภาพ หรือวิดีโอ** [3][4] เอกสารโมเดลระบุ input เป็น text/JSON ไม่มีภาพ เสียง หรือวิดีโอโดยตรง; ถ้าประเมินสื่อ ต้องแปลงเป็นคำบรรยายหรือ metadata ก่อน [5]

| จุดใน workflow | บทบาท Jev ที่เสนอ | ข้อจำกัด |
|---|---|---|
| ก่อนเข้าคิว | `choice` แยกประเภทงานหรือเลือก template จากตัวเลือกที่กำหนด | ไม่เขียน prompt ใหม่ [3][4] |
| ตรวจคุณภาพ prompt | `score` ให้ระดับความชัดเจน/ความครบของ prompt ตาม rubric | ต้องทดสอบคะแนนกับตัวอย่างงานจริงและภาษาไทย [4][5] |
| ตัดสินใจทำต่อ | `noul` ประเมินว่า metadata แสดงงานล้มเหลวหรือควรให้คนตรวจ | ไม่ใช้คะแนนโมเดลแทนสถานะงานจากผู้ให้บริการ [4] |
| ตรวจผลหลังงานเสร็จ | ประเมิน **ข้อความ/metadata** ของผลลัพธ์เพื่อคัดงานเข้าคิวตรวจ | Jev ไม่ดูไฟล์ภาพ/วิดีโอเอง [5] |

เอกสาร Quick start ระบุ `POST https://api.typesafe.ai/v1/systemone` ส่ง `state`, `model: "jev-latest"`, `questions`; ใช้ `Authorization: Bearer <API_KEY>`; ผลตอบกลับมี `answers` และ `usage` [4] เอกสารระบุ primitives `noul`, `choice`, `score` และมี Python/JavaScript SDK [4][5] **ข้อเสนอด้านความปลอดภัย**: เก็บ API key ใน backend ของผู้พัฒนา ไม่ฝังไว้ในส่วนขยายที่ผู้ใช้ดาวน์โหลด; ส่งเฉพาะข้อความ/metadata ที่ผู้ใช้ยินยอมผ่าน HTTPS พร้อมจำกัดการเก็บข้อมูล [4][8] Jev เปิดแบบ early access ตามประกาศ; ต้องมีบัญชีและสิทธิ์จริงก่อนทดสอบ end-to-end [3][4]

ราคาในเอกสาร Jev 1.13 คือ **$0.042 ต่อหนึ่งล้าน input tokens**, output tokens ไม่คิดราคา; ขีดจำกัดที่เผยแพร่ **1,200 requests/minute** และ **250,000 tokens/second** แต่ผู้ให้บริการระบุว่าอาจเปลี่ยนโดยไม่แจ้งล่วงหน้า [5] ความเร็ว 70–500 ms เป็นตัวเลขที่ผู้ให้บริการเผยแพร่ ไม่ใช่ benchmark ที่เรารันเอง [3] เอกสารระบุภาษาอังกฤษเป็นภาษาฝึกหลัก: ต้องประเมินความแม่นยำบน prompt ภาษาไทยก่อนใช้ threshold อัตโนมัติ [5]

## แบบผลิตภัณฑ์ขั้นต่ำที่แนะนำ (ข้อเสนอ ไม่ใช่พฤติกรรมที่ยืนยันของต้นแบบ)

1. **เริ่มจาก local queue + review**: ผู้ใช้ใส่ prompt, จับคู่ไฟล์อ้างอิง, ดู preview, สั่งเริ่ม/หยุด, บันทึกสถานะและรายการดาวน์โหลด โดยไม่ส่งงานไปแพลตฟอร์มภายนอกอัตโนมัติจนกว่าจะยืนยันช่องทางที่อนุญาต [1][2][6]
2. **เพิ่ม Jev เป็น decision gate**: backend รับข้อความ prompt ที่ผู้ใช้เลือก, เรียก Jev ประเมิน `choice`/`score`/`noul`, คืนคะแนนกับเหตุผลที่เป็น rubric/เกณฑ์แสดงผลซึ่งโค้ดกำหนดเอง; ให้ผู้ใช้อนุมัติผลก่อนดำเนินการ [3][4]
3. **เพิ่มตัวเชื่อมผู้สร้างภาพ/วิดีโอเมื่อยืนยันสิทธิ์**: เลือก API ที่ผู้ให้บริการเผยแพร่และอนุญาตก่อน หากไม่มี ต้องชี้แจงความเสี่ยงและขอการตัดสินใจใหม่ ไม่ถือว่าการคลิก DOM เป็น API ที่รองรับ [1][2]
4. **ออกแบบ MV3 ให้ทนต่อการปิด service worker**: งานที่ค้างเก็บใน `chrome.storage`; งานตามเวลาใช้ `chrome.alarms`; ขอ host permissions เฉพาะโดเมนที่จำเป็นและขอเมื่อใช้จริง [6][7][8]
5. **การเผยแพร่**: ตรวจนโยบาย Chrome Web Store เรื่องวัตถุประสงค์เดียว, สิทธิ์ขั้นต่ำ, ความเป็นส่วนตัว และ remote-hosted code; แจ้งข้อมูลที่ส่งให้ TypeSafe และขอความยินยอมที่เหมาะสม [8][9]

การตั้งคิวในเครื่องไม่เท่ากับการสร้างงานได้ขณะปิดเบราว์เซอร์: `chrome.alarms` ปลุก extension เมื่อ Chrome ทำงาน แต่ไม่ปลุกอุปกรณ์ที่หลับ และ service worker ไม่ใช่ process ถาวร [6][7]

## ความเสี่ยงและคำถามก่อนเริ่มโค้ด

- **เป้าหมายแน่ชัด**: ต้องการใช้งาน `vibes.ai`, `meta.ai`, หรือทั้งคู่? หน้ารายการปัจจุบันกับคู่มือผู้พัฒนาไม่ตรงกัน [1][2]
- **สิทธิ์ใช้งาน**: ผู้ให้บริการเป้าหมายมี API หรืออนุญาต bulk generation ผ่านส่วนขยายหรือไม่? ยังไม่ยืนยัน; ต้องอ่านข้อกำหนดที่มีผลและถามผู้ให้บริการ [1][2]
- **ตัวสร้าง prompt**: ต้องการ template ในเครื่องหรือ text-generation model เพิ่ม? Jev ไม่สร้างข้อความอิสระ [3]
- **ข้อมูลที่ส่งออก**: prompt/reference metadata อาจเป็นข้อมูลส่วนตัวหรือความลับ; ต้องกำหนด consent, retention และ privacy disclosure ก่อนเปิดให้ผู้ใช้จริง [8][9]
- **ประเมินความแม่นยำ**: ทดสอบ rubric Jev กับชุด prompt ภาษาไทยและ failure cases ก่อนใช้คะแนนตัดสินใจส่งงาน [5]
- **ถ้าหมายถึง X/Twitter จริง**: เป็นระบบเผยแพร่แยกอีกขอบเขต ต้องศึกษานโยบาย automation และใช้ช่องทาง API ทางการ; ห้ามอนุมานว่าชื่อ “Meta x Vibes” หมายถึง X [1][10]

## แหล่งปฐมภูมิ

1. [Chrome Web Store — Meta x Vibes Automator](https://chromewebstore.google.com/detail/meta-x-vibes-automator-%E2%80%93/caphdchhomcgjlligpbbjmmfcpkelkmm) — ชื่อ เวอร์ชัน ผู้เผยแพร่ และรายการฟีเจอร์
2. [AutoPlayLabs — Meta Automator Tutorial](https://autoplaylabs.com/meta-automator-tutorial/) — วิธีใช้ที่ผู้พัฒนาอธิบาย; อาจเก่ากว่าหน้า Store
3. [TypeSafe AI — Introducing System One Models & Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) — บทบาทโมเดล, early access และผลวัดที่บริษัทเผยแพร่
4. [TypeSafe AI — Quick start](https://docs.typesafe.ai/introduction/quickstart) — endpoint, auth, request/response ตัวอย่าง
5. [TypeSafe AI — Models](https://docs.typesafe.ai/models) — ราคา, limits, ขอบเขต input และภาษา
6. [Chrome Extensions — Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — อายุ worker และ state
7. [Chrome Extensions — Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms) — scheduling และข้อจำกัด
8. [Chrome Extensions — Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) และ [Chrome Web Store — Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use) — สิทธิ์และข้อมูลผู้ใช้
9. [Chrome Web Store — Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies) และ [Remote hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code) — เงื่อนไขเผยแพร่
10. [X — Automation rules](https://help.x.com/en/rules-and-policies/x-automation) — อ้างอิงเฉพาะถ้าขยายไป `x.com` จริง

**วิธีตรวจ**: แยกงาน 5 สาย (หน้าส่วนขยาย, นโยบาย X, Jev, MV3, ตรวจข้อขัดแย้ง); ตรวจซ้ำหน้ารายการ, คู่มือผู้พัฒนา และเอกสาร TypeSafe โดยตรง ไม่ได้เข้าสู่ระบบ ไม่ติดตั้งส่วนขยาย ไม่เรียก API ด้วย credential และไม่ทดสอบสร้างสื่อจริง รายละเอียดภายในของส่วนขยายหรือความเข้ากันได้กับแพลตฟอร์มเป้าหมายจึงยังเป็นข้อไม่ทราบ
