CreateThread(function()
  while true do
    local sleep = 1000
    if IsControlPressed(0, 38) then sleep = 0 end
    Wait(sleep)
  end
end)
