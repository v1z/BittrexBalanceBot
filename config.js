exports.config = {
    required: {
        botToken: '1234567',
        mongoURI: '1234567',
    },
    optional: {
        telegramUserID: 1234567, 
        donations: [
            {
                coin: 'LTC',
                wallet: 'LhZCNUUv2fPVs66s68iSh4BxKPLy24oA5T'
            },
            {
                coin: 'ETC',
                wallet: '0x5654521322a21c95021B2a90e0c3bdffE1d721Bf'
            },
            {
                coin: 'ETH',
                wallet: '0xb1E87889b4bde8737c561810121Bc8a12A36C153'
            },
        ],
    },
}