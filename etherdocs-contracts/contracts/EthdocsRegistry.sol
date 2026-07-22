// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EthdocsRegistry {
    mapping(bytes32 => bool) public certificates;
    address public owner;

    event CertificateAdded(bytes32 indexed certHash);

    constructor() {
        owner = msg.sender;
    }

    // Fonksiyon parametresi (bytes32 certHash) olarak düzeltildi
    function addCertificate(bytes32 certHash) public {
        require(!certificates[certHash], "Sertifika zaten kayitli!");
        certificates[certHash] = true;
        emit CertificateAdded(certHash);
    }

    function verifyCertificate(bytes32 certHash) public view returns (bool) {
        return certificates[certHash];
    }
}