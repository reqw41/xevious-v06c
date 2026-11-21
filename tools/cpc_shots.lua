-- MAME cpc6128: запуск с дискеты, нажатия и снимки.
-- XEV_KEYS="кадр:код,..." (natkeyboard), XEV_HOLD="с:по:поле,..." (поле ioport, напр. P1 Button 1),
-- XEV_SHOTS="кадр,..." или XEV_EVERY=N с XEV_FROM, XEV_STOP
local m = manager.machine
local ev = {}
for fr, k in string.gmatch(os.getenv("XEV_KEYS") or "", "(%d+):([^,]+)") do ev[tonumber(fr)] = k end
local hold = {}
for a, b, name in string.gmatch(os.getenv("XEV_HOLD") or "", "(%d+):(%d+):([^,]+)") do
  for _, p in pairs(m.ioport.ports) do
    local fld = p.fields[name]
    if fld then hold[#hold+1] = {tonumber(a), tonumber(b), fld} end
  end
end
local shots = {}
for fr in string.gmatch(os.getenv("XEV_SHOTS") or "", "(%d+)") do shots[tonumber(fr)] = true end
local EVERY = tonumber(os.getenv("XEV_EVERY") or "0"); local FROM = tonumber(os.getenv("XEV_FROM") or "0")
local STOP = tonumber(os.getenv("XEV_STOP") or "3000")
local f = 0
emu.register_frame_done(function()
  f = f + 1
  if f == 150 then m.natkeyboard:post_coded('run"disc.bin{ENTER}') end
  if ev[f] then m.natkeyboard:post_coded(ev[f]) end
  for _, h in ipairs(hold) do
    if f == h[1] then h[3]:set_value(1) elseif f == h[2] then h[3]:set_value(0) end
  end
  if shots[f] or (EVERY > 0 and f >= FROM and (f - FROM) % EVERY == 0) then m.video:snapshot() end
  if f == STOP then m:exit() end
end)
