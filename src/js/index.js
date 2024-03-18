import { Polkadot, Ethereum, AddEthereumChainParameter } from '@unique-nft/utils/extension';
import * as ethers from 'ethers';
import { Sdk } from '@unique-nft/sdk/full';
import { Address } from '@unique-nft/utils';

import FHFTickets from './FHFTickets.json';

const DEFAULT_CHAIN = Ethereum.UNIQUE_CHAINS_DATA_FOR_EXTENSIONS.opal; // testnet OPAL
const OPAL_SDK_REST_URI = 'https://rest.unique.network/opal/v1';
const COLLECTION_ID = 2486;
const GAS_LIMIT = 200_000;
const CONTRACT_ADDRESS = '0xcFD8B054AACB162dFaA811cf2766c00979420213';
const NEW_TICKET_IMAGE_URL = 'https://ipfs.unique.network/ipfs/Qme7ntQxiuP6mKx9Y2CsyXkicvqiMN2HUP9UwMt7TeamVB';

const sdk = new Sdk({ baseUrl: OPAL_SDK_REST_URI });

let allAccounts = [];

function updateWalletsList() {
  const $walletsSelect = document.getElementById('wallets');
  $walletsSelect.innerHTML = '';  
  allAccounts.forEach((wallet) => {
    if (!wallet) return;
    const option = document.createElement('option');
    option.innerHTML = `[${wallet.name}] ${wallet.address}`;
    option.value = wallet.address;
    $walletsSelect.appendChild(option);
  });
}

async function sign() {
  const $walletsSelect = document.getElementById('wallets');
  const $messageInput = document.getElementById('message');
  const $signatureTextarea = document.getElementById('signature');

  const currentAddress = $walletsSelect.value;

  const account = allAccounts.find(({ address }) => currentAddress === address);

  const { signature } = await account.signer.sign($messageInput.value);
  $signatureTextarea.value = signature;
}

async function init() {
  console.log('Initializing');

  global.connectPolkadotWallet = connectPolkadotWallet;
  global.connectMetamaskWallet = connectMetamaskWallet;

  global.getTokensByAccountViaRest = getTokensByAccountViaRest;

  global.getTokenData = getTokenData;
  global.dropTickets = dropTickets;
  global.useTicket = useTicket;
}

/**
 * Change chain in Metamask wallet
 * @param {AddEthereumChainParameter} EthereumChainParams 
 * @returns 
 */
async function changeMetamaskChain(EthereumChainParams) {
  if (!(await window.ethereum?.isConnected())) return;

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: EthereumChainParams.chainId }]
    });
  } catch {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [EthereumChainParams]
    });
  }
};

/**
 * Connect with any Polkadot wallet
 * @param {string} extensionName name of the extension
 */
async function connectPolkadotWallet(extensionName) {
  const { accounts } = await Polkadot.loadWalletByName(extensionName);
  allAccounts.push(...accounts);
  updateWalletsList();
}

/**
 * Sign with Metamask
 * @param {string} message 
 * @returns Promise<{ signature: string }>
 */
async function signWithMetamask(message) {
  const metamaskProvider = new ethers.providers.Web3Provider(window.ethereum);
  const signature = await metamaskProvider.getSigner().signMessage(message);
  return { signature };
}

/**
 * Connect with Metamask
 */
async function connectMetamaskWallet() {
  const {address, chainId} = await Ethereum.requestAccounts();
  if (chainId !== DEFAULT_CHAIN.chainId) {
    await changeMetamaskChain(DEFAULT_CHAIN);
  }
  allAccounts.push({
    name: 'Metamask account',
    isMetamask: true,
    address,
    signer: {
      sign: signWithMetamask
    }
  });
  updateWalletsList();
}

/**
 * get the list of tokens for the selected account via REST API
 */
async function getTokensByAccountViaRest() {
  const $walletsSelect = document.getElementById('wallets');
  const currentAddress = $walletsSelect.value; // get the current address

  const response = await fetch(`${OPAL_SDK_REST_URI}/tokens/account-tokens?address=${currentAddress}&collectionId=${COLLECTION_ID}`);

  const parsedResponse = await response.json(); // parse the response
  const { tokens } = parsedResponse;

  const $tokenList = document.getElementById('token-list');
  $tokenList.innerHTML = '';  
  tokens.forEach(function(token) {
    const item = document.createElement('li');
    item.innerHTML = `${token.collectionId}/${token.tokenId}`;
    $tokenList.appendChild(item);
  });
}

/**
 * fetch the token data
 */
async function getTokenData() {
  const $tokenIdInput = document.getElementById('token-id');
  const $tokenData = document.getElementById('token-data');

  const tokenId = $tokenIdInput.value;

  const response = await fetch(`${OPAL_SDK_REST_URI}/tokens?collectionId=${COLLECTION_ID}&tokenId=${tokenId}`);

  const data = await response.json();

  $tokenData.innerHTML = '';  

  const $image = document.createElement('img');
  $image.src = data.image.fullUrl;
  const $description = document.createElement('div');
  $description.innerHTML = [`Prefix: ${data.collection.tokenPrefix}`,
    `Name: ${data.collection.name}`,
    `Description: ${data.collection.description}`,
    `Owner: ${data.owner}`].join('<br/>');

  const $attributesList = document.createElement('ul');

  Object.values(data.attributes).map(attribute => {
    const $attribute = document.createElement('li');
    $attribute.innerHTML = `${attribute.name._} = ${attribute.value._}`;
    $attributesList.appendChild($attribute);
  });
  
  $tokenData.appendChild($image);
  $tokenData.appendChild($description);
  $tokenData.appendChild($attributesList);
}

async function dropTicketsViaPolkadot(to, _count, account) {
  await sdk.token.createMultiple.submitWaitResult({
   address: account.address || '',
   collectionId: COLLECTION_ID,
   tokens: new Array(_count).fill(null).map(() => ({
     owner: Address.extract.addressNormalized(to),
     data: { image: { urlInfix: NEW_TICKET_IMAGE_URL } }
   }))
 }, { signer: account.signer });

  // await sdk.evm.send.submitWaitResult({
  //   abi: FHFTickets.abi,
  //   address: account.address || '',
  //   contractAddress: CONTRACT_ADDRESS,
  //   funcName: 'dropTicketsBatchCross',
  //   gasLimit: GAS_LIMIT,
  //   args: {
  //     _to: [Address.extract.ethCrossAccountId(to)],
  //     _count,
  //   }
  // }, { signer: account.signer });
}

async function dropTicketsViaMetamask(to, count) {
  const metamaskProvider = new ethers.providers.Web3Provider(window.ethereum);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, FHFTickets.abi, metamaskProvider.getSigner());
  const tx = await contract.dropTicketsBatchCross(
    [Address.extract.ethCrossAccountId(to)], 
    count
  );
  await tx.wait();
}

async function dropTickets() {
  const $walletsSelect = document.getElementById('wallets');
  const currentAddress = $walletsSelect.value; // get the current address
  const $recipientInput = document.getElementById('recipient');
  const $countInput = document.getElementById('count');

  const count = Number($countInput.value);
  const to = $recipientInput.value;

  const account = allAccounts.find(({ address }) => currentAddress === address);

  if (!account || !to || !count)  return;

  if (account.isMetamask) {
    await dropTicketsViaMetamask(to, count, account);
    return;
  }

  dropTicketsViaPolkadot(to, count, account)
}


async function useTicketViaPolkadot(_tokenId, account) {
  await sdk.evm.send.submitWaitResult({
    abi: FHFTickets.abi,
    address: account.address || '',
    contractAddress: CONTRACT_ADDRESS,
    funcName: 'useTicket',
    gasLimit: GAS_LIMIT,
    args: {_tokenId}
  }, { signer: account.signer });

}

async function useTicketViaMetamask(_tokenId) {
  const metamaskProvider = new ethers.providers.Web3Provider(window.ethereum);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, FHFTickets.abi, metamaskProvider.getSigner());
  const tx = await contract.useTicket(_tokenId);
  await tx.wait();
}

async function useTicket() {
  const $walletsSelect = document.getElementById('wallets');
  const currentAddress = $walletsSelect.value; // get the current address
  const $tokenIdInput = document.getElementById('token-id-to-use');
  const tokenId = Number($tokenIdInput.value);

  const account = allAccounts.find(({ address }) => currentAddress === address);

  if (!account || !tokenId)  return;

  if (account.isMetamask) {
    await useTicketViaMetamask(tokenId);
    return;
  }

  await useTicketViaPolkadot(tokenId, account)
}

init();

