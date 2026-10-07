RegisterNetEvent('mfx:give', function(amount)
  local Player = exports.qbx_core:GetPlayer(source)
  if Player then Player.Functions.AddMoney('cash', amount) end
end)

RegisterServerEvent('mfx:old')
