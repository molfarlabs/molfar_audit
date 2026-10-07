RegisterNetEvent('mfx_clean:buy', function(amount)
  if type(amount) ~= 'number' or amount < 1 or amount > 10 then return end
  local Player = exports.qbx_core:GetPlayer(source)
  if not Player then return end
  exports.ox_inventory:AddItem(source, 'water', amount)
end)
