// Otomatik üretildi — elle düzenlemeyin. Güncellemek için: npm run sync:frontend
window.ETHERDOCS_CONFIG = {
  "CONTRACT_NAME": "EthdocsRegistry",
  "CONTRACT_ADDRESS": "0xa094F4310D1B7CC5fA31747992a2fecc18Fc9378",
  "CHAIN_ID": 80002,
  "RPC_URL": "https://rpc-amoy.polygon.technology",
  "CONTRACT_ABI": [
    {
      "inputs": [],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "bytes32",
          "name": "certHash",
          "type": "bytes32"
        }
      ],
      "name": "CertificateAdded",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "certHash",
          "type": "bytes32"
        }
      ],
      "name": "addCertificate",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "",
          "type": "bytes32"
        }
      ],
      "name": "certificates",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "owner",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "bytes32",
          "name": "certHash",
          "type": "bytes32"
        }
      ],
      "name": "verifyCertificate",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ]
};
