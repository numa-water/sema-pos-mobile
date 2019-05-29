import React, {Component}  from "react";
import { View, CheckBox, Text, Image, TouchableHighlight, TextInput, StyleSheet, Modal, Alert } from "react-native";
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'

import {connect} from "react-redux";
import {bindActionCreators} from "redux";
import * as OrderActions from "../../actions/OrderActions";
import * as CustomerBarActions from "../../actions/CustomerBarActions";
import PosStorage from '../../database/PosStorage';

import * as Utilities from "../../services/Utilities";
import i18n from "../../app/i18n";
import Events from "react-native-simple-events";
import moment from "moment-timezone";

class PaymentDescription extends Component {
	render() {
		return (
			<View style={[{flex: 1, flexDirection: 'row', marginTop:"1%"} ]}>
				<View style={ [{flex: 3}]}>
					<Text style={[styles.totalTitle]}>{this.props.title}</Text>
				</View>
				<View style={[ {flex: 2}]}>
					<Text style={[styles.totalValue]}>{this.props.total}</Text>
				</View>
			</View>
		);
	}
}
class PaymentMethod extends Component{
	render(){
		return (
			<View style = {styles.checkBoxRow}>
				<View style={ [{flex: 1}]}>
					<CheckBox
						style = {styles.checkBox}
						value={this.props.checkBox}
						onValueChange={this.props.checkBoxChange}/>
				</View>
				<View style={ [{flex: 3}]}>
					<Text style = {styles.checkLabel} >{this.props.checkBoxLabel}</Text>
				</View>
				<View style={[{flex: 3}]}>
					{this.showTextInput()}
				</View>
			</View>
		);
	}
	showTextInput (){
		if( this.props.parent.state.isCredit || this.props.parent.isPayoffOnly()) {
			if (this.props.type === 'cash' && this.props.parent.state.isCash) {
				return (
					<TextInput
						underlineColorAndroid='transparent'
						onChangeText={this.props.valueChange}
						keyboardType = 'numeric'
						value = {this.props.value}
						style={[styles.cashInput]}/>
				);
			} else if (this.props.type === 'credit') {
				return (
					<Text style = {styles.checkLabel}>{this.props.value}</Text>
				);

			}if (this.props.type === 'mobile' && this.props.parent.state.isMobile) {
				return (
					<TextInput
					underlineColorAndroid='transparent'
					onChangeText={this.props.valueChange}
					keyboardType = 'numeric'
					value = {this.props.value}
					style={[styles.cashInput]}/>
				);
			}
		}
		return null;
	}
}

class OrderPaymentScreen extends Component {
	constructor(props) {
		super(props);
		this.saleSuccess = false;
		this.state = {
			isCash: true,
			isCredit: false,
			isMobile:false,
			isCompleteOrderVisible :false
		};
	}
	componentDidMount() {
		console.log("OrderPaymentScreen = Mounted");
		this.updatePayment(0, this.calculateOrderDue().toString());

	}

	render() {
		return (
			<KeyboardAwareScrollView
				style={styles.orderPayment}
				resetScrollToCoords={{ x: 0, y: 0 }}
				contentContainerStyle={styles.container}
				scrollEnabled={false}>
				<View style ={{justifyContent:'flex-end', flexDirection:"row", right:100, top:10}}>
					{this.getCancelButton()}
				</View>
				<View style={{flex:1, marginTop:0, marginBottom:50, marginLeft:100, marginRight:100}}>
					<PaymentMethod
						parent = {this}
						type = {"cash"}
						checkBox = {this.state.isCash}
						checkBoxChange = {this.checkBoxChangeCash.bind(this)}
						checkBoxLabel = {i18n.t('cash')}
						value = {this.props.payment.cashToDisplay}
						valueChange = {this.valuePaymentChange} />
					{this.getCreditComponent()}
					<PaymentMethod
						parent = {this}
						type = {"mobile"}
						checkBox = {this.state.isMobile}
						checkBoxChange = {this.checkBoxChangeMobile.bind(this)}
						checkBoxLabel = {i18n.t('mobile')}
						value = {this.props.payment.mobileToDisplay}
						valueChange = {this.valuePaymentChange}/>
					{this.getSaleAmount()}
					<PaymentDescription title = {`${i18n.t('previous-amount-due')}:`} total={Utilities.formatCurrency( this.calculateAmountDue())}/>
					<PaymentDescription title = {`${i18n.t('total-amount-due')}:`} total={Utilities.formatCurrency( this.calculateTotalDue())}/>
					<View style={styles.completeOrder}>
						<View style={{justifyContent:'center', height:80}}>
							<TouchableHighlight underlayColor = '#c0c0c0'
								onPress={() => this.onCompleteOrder()}>
								<Text style={ [ {paddingTop:20, paddingBottom:20}, styles.buttonText]}>{i18n.t('complete-sale')}</Text>
							</TouchableHighlight>
						</View>
					</View>
				</View>
				<Modal visible = {this.state.isCompleteOrderVisible}
					   backdropColor={'red'}
					   transparent ={true}
					   onRequestClose ={this.closeHandler}>
					{this.ShowCompleteOrder()}
				</Modal>

			</KeyboardAwareScrollView>

		);
	}
	getSaleAmount(){
		if( !this.isPayoffOnly() ){
			return (
				<PaymentDescription title = {`${i18n.t('sale-amount-due')}: `} total={Utilities.formatCurrency( this.calculateOrderDue())}/>
			);
		}else{
			return null;
		}
	};


	getCancelButton(){
		if( ! this.isPayoffOnly()){
			return(
				<TouchableHighlight
					onPress={() => this.onCancelOrder()}>
					<Image source={require('../../images/icons8-cancel-50.png')}/>
				</TouchableHighlight>
			);
		}else{
			return null;
		}
	}
	getCreditComponent(){
		if( ! this._isAnonymousCustomer(this.props.selectedCustomer) && !this.isPayoffOnly() ){
			return (
				<PaymentMethod
					parent = {this}
					type = {"credit"}
					checkBox = {this.state.isCredit}
					checkBoxChange = {this.checkBoxChangeCredit.bind(this)}
					checkBoxLabel = {i18n.t('loan')}
					value = {this.props.payment.creditToDisplay} />
			)
		}else{
			return null;
		}
	}
	_roundToDecimal( value ){
		return parseFloat(value.toFixed(2));

	}
	_isAnonymousCustomer( customer ){
		return PosStorage.getCustomerTypeByName("anonymous").id == customer.customerTypeId ? true : false;
	}

	calculateOrderDue(){
		if( this.isPayoffOnly()){
			// If this is a loan payoff then the loan payment is negative the loan amount due
			return this.calculateAmountDue();
		}else {
			return this.props.products.reduce((total, item) => {
				return (total + item.quantity * this.getItemPrice(item.product))
			}, 0);
		}
	}
	calculateAmountDue(){
		return this.props.selectedCustomer.dueAmount;
	}

	calculateTotalDue(){
		if (this.isPayoffOnly()) {
			let paymentAmount;

			if (this.state.isMobile) {
				paymentAmount = this.props.payment.mobile;
			} else if (this.state.isCash) {
				paymentAmount = this.props.payment.cash;
			}

			return this._roundToDecimal((this.calculateAmountDue() - paymentAmount));
		} else {
			return this._roundToDecimal((this.calculateOrderDue() + this.calculateAmountDue()));
		}
	}

	onCompleteOrder = ()=>{
		this.setState({isCompleteOrderVisible:true});

	};
	onCancelOrder =() =>{
		this.props.orderActions.SetOrderFlow('products');
	};

	getItemPrice = (item) =>{
		let productMrp = this._getItemMrp( item );
		if( productMrp ){
			return productMrp.priceAmount;
		}
		return item.priceAmount;	// Just use product price
	};

	getItemCogs = (item) =>{
		let productMrp = this._getItemMrp( item );
		if( productMrp ){
			return productMrp.cogsAmount;
		}
		return item.cogsAmount;	// Just use product cogs
	};

	_getItemMrp = (item) =>{
		let salesChannel = PosStorage.getSalesChannelFromName(this.props.channel.salesChannel);
		if( salesChannel ){
			let productMrp = PosStorage.getProductMrps()[PosStorage.getProductMrpKeyFromIds(item.productId, salesChannel.id)];
			if( productMrp ){
				return productMrp;
			}
		}
		return null;
	};

	valuePaymentChange = (textValue) => {
		let floatValue = parseFloat(textValue) || 0.00;

		// If user is about to input a floating point number
		if (!textValue.endsWith('.')) {
			if (floatValue > this.calculateOrderDue()) {
				floatValue = this.calculateOrderDue();
			}

			let credit = this._roundToDecimal(this.calculateOrderDue() - floatValue);
			this.updatePayment(credit, textValue);
		} else {
			this.updatePayment(this.calculateOrderDue() - floatValue, textValue );
		}
	};

	checkBoxChangeCash= () => {
		this.setState({ isMobile: !this.state.isMobile });

		this.setState({ isCash: !this.state.isCash }, function() {
			this.updatePayment(
				this.state.isCredit ? this.calculateOrderDue().toFixed(2) - this.props.payment.cash : 0,
				this.state.isCredit ? '0.00' : this.calculateOrderDue().toFixed(2));
		});
	};

	checkBoxChangeCredit= () => {
		this.setState({ isCredit: !this.state.isCredit }, function() {
			this.updatePayment(
				this.calculateOrderDue().toFixed(2),
				this.state.isCredit ? '0.00' : this.calculateOrderDue().toFixed(2));
		});
	};

	checkBoxChangeMobile= () => {
		this.setState({ isCash: !this.state.isCash });

		this.setState({ isMobile: !this.state.isMobile } , function() {
			this.updatePayment(
				this.state.isCredit ? this.calculateOrderDue().toFixed(2) - this.props.payment.mobile : 0,
				this.state.isCredit ? '0.00' : this.calculateOrderDue().toFixed(2));
		});
	};

	updatePayment = (credit, textToDisplay) => {
		let payment,
			floatToDisplay = parseFloat(textToDisplay) || 0.00;

		credit = parseFloat(credit);

		if (this.state.isCredit) {
			payment = {
				cash: this.state.isCash ? floatToDisplay : 0.00,
				cashToDisplay: this.state.isCash ? textToDisplay : '0.00',
				mobileToDisplay: this.state.isMobile ? textToDisplay : '0.00',
				creditToDisplay: `${credit}`,
				credit: credit,
				mobile: this.state.isMobile ? floatToDisplay : 0.00
			};
		} else {
			payment = {
				cashToDisplay: this.state.isCash ? textToDisplay : '0.00',
				mobileToDisplay: this.state.isMobile ? textToDisplay : '0.00',
				credit: 0,
				creditToDisplay: '0.00',
			};

			if (this.isPayoffOnly()) {
				payment.cash = this.state.isCash ? floatToDisplay : 0.00;
				payment.mobile = this.state.isMobile ? floatToDisplay : 0.00;
			} else {
				payment.cash = this.state.isCash ? this.calculateOrderDue() : 0.00;
				payment.mobile = this.state.isMobile ? this.calculateOrderDue() : 0.00;
			}
		}

		this.props.orderActions.SetPayment(payment);
	};

	closeHandler= ()=>{
		this.setState( {isCompleteOrderVisible:false} );
		if( this.saleSuccess) {
			this.props.customerBarActions.ShowHideCustomers(1);
		}else{
			Alert.alert(
				"Invalid payment amount. ",
				'The amount paid cannot exceed to cost of goods and customer amount due',
				[
					{ text: 'OK', onPress: () => console.log('OK Pressed') },
				],
				{ cancelable: false }
			);

		}
	};

	ShowCompleteOrder = () =>{
		let that = this;
		if( this.state.isCompleteOrderVisible ) {
			if( this.formatAndSaveSale() ) {
				this.saleSuccess = true;
				setTimeout(() => {
					that.closeHandler()
				}, 500);
			}else{
				this.saleSuccess = false;
				setTimeout(() => {
					that.closeHandler()
				}, 1);
			}
		}
		return (
			<View style={{
				flex: 1,
				flexDirection: 'column',
				justifyContent: 'center',
				alignItems: 'center'
			}}>

				<View style={styles.orderProcessing}>
					<Text style={{fontSize:24, fontWeight:'bold'}}>{i18n.t('processing-order')}</Text>
				</View>
			</View>
		);
	};

	_getReceiptPaymentType() {
		if (this.state.isCredit && this.props.payment.credit > 0) {
			if (this.state.isCash) {
				return 'Cash/Loan';
			} else if (this.state.isMobile) {
				return 'Mobile/Loan';
			}

			return 'Loan';
		}

		if (this.state.isCash) {
			return 'Cash';
		} else if (this.state.isMobile) {
			return 'Mobile';
		}

		return 'Cash';
	}

	formatAndSaveSale = () => {
		const currentUser = PosStorage.getSettings().user;
		const creditProduct = PosStorage.getProducts().reduce((final, product) => {
			if (product.sku === 'LOANPAYOFF') return product;
			return final;
		}, {});
		let amountPaid = 0,
			payoff = 0,
			orderAmount = this.calculateOrderDue().toFixed(2),
			customerDueAmount = this.props.selectedCustomer.dueAmount,
			customerDueAmountUpdated = false;

		if (this.state.isCash) {
			amountPaid = this.props.payment.cash;
		} else if (this.state.isMobile) {
			amountPaid = this.props.payment.mobile;
		}

		// We don't allow any sale to be processed if the paid amount
		// is greater than what the customer owes or greater than the cart price
		// This can be used as some kind of wallet option
		if (!this.isPayoffOnly()) { // If it's a purchase
			// If the amount paid is greater than the cart price
			// we assume customer is paying off a loan amount
			if (amountPaid > orderAmount) {
				// if the customer doesn't owe anything... no processing
				if (!customerDueAmount) {
					return false;
				}

				payoff = amountPaid - orderAmount;

				// In case of overpayment... no processing
				if (payoff > customerDueAmount) {
					return false;
				}
			}
		} else { // If it's specifically a loan payment
			// If it's an overpayment... no processing
			if (amountPaid > this.calculateAmountDue()) {
				return false;
			}
		}

		let receiptDate = new Date(Date.now());

		let receipt = {
			id: moment.tz(receiptDate, moment.tz.guess()).format('YYYY-MM-DDTHH:mm:ss.SSZ'),
			createdDate: receiptDate,
			customerId: this.props.selectedCustomer.customerId,
			amountCash: this.props.payment.cash,
			amountLoan: this.props.payment.credit,
			amountMobile: this.props.payment.mobile,
			siteId: this.props.selectedCustomer.siteId,
			salesChannelId: this.props.selectedCustomer.salesChannelId,
			customerTypeId: this.props.selectedCustomer.customerTypeId,
			products: [],
			active: 1,
			userName: currentUser
		};

		receipt.paymentType = this._getReceiptPaymentType();

		// This fixes issues with the pseudo direct customer
		if (!receipt.siteId) {
			receipt.siteId = PosStorage.getSettings().siteId;
		}

		// If the customer is purchasing, not specifically paying off a loan
		if (!this.isPayoffOnly()) {
			let cogsTotal = 0;

			receipt.currencyCode = this.props.products[0].product.priceCurrency;

			receipt.products = this.props.products.map(product => {
				let receiptLineItem = {};

				receiptLineItem.priceTotal = this.getItemPrice(product.product) * product.quantity;
				receiptLineItem.quantity = product.quantity;
				receiptLineItem.productId = product.product.productId;
				receiptLineItem.cogsTotal = this.getItemCogs(product.product) * product.quantity;
				// The items below are used for reporting...
				receiptLineItem.sku = product.product.sku;
				receiptLineItem.description = product.product.description;
				if (['liter', 'gallon'].includes(product.product.unitMeasure)) {
					receiptLineItem.litersPerSku = product.product.unitPerProduct;
				} else {
					receiptLineItem.litersPerSku = "N/A";
				}

				cogsTotal += receiptLineItem.cogsTotal;
				receiptLineItem.active = 1;

				return receiptLineItem;
			});

			receipt.total = orderAmount;
			receipt.cogs = cogsTotal;

			// We increase the customer due amount if this purchase is a loan
			if (receipt.amountLoan > 0) {
				customerDueAmount += receipt.amountLoan;
				customerDueAmountUpdated = true;
			} else if (payoff) { // If this purchase has an overpayment, decrease the due amount
				customerDueAmount -= payoff;
				customerDueAmountUpdated = true;
			}
		} else { // If it's specifically a loan payoff
			receipt.currencyCode = creditProduct.priceCurrency;

			const receiptLineItem = {
				quantity: 1,
				productId: creditProduct.productId,
				cogsTotal: creditProduct.cogsAmount,
				sku: creditProduct.sku,
				description: creditProduct.description,
				active: 1,
				priceTotal: amountPaid
			};

			// We already know this product is not a water product
			receiptLineItem.litersPerSku = "N/A";

			// By design, the LOANPAYMENT product has a price and a cogs amount of 0
			// so no calculations needed
			receipt.total = receiptLineItem.priceTotal;
			receipt.cogs = receiptLineItem.cogsTotal;

			receipt.products.push(receiptLineItem);

			// We decrease the due amount of the customer
			customerDueAmount -= amountPaid;
			customerDueAmountUpdated = true;
		}

		if (customerDueAmountUpdated) {
			this.props.selectedCustomer.dueAmount = customerDueAmount;

			PosStorage.updateCustomer(
				this.props.selectedCustomer,
				this.props.selectedCustomer.phoneNumber,
				this.props.selectedCustomer.name,
				this.props.selectedCustomer.address,
				this.props.selectedCustomer.salesChannelId,
				this.props.selectedCustomer.customerTypeId);
		}

		// Save the receipt locally
		PosStorage.addSale(receipt).then(saleKey => {
			Events.trigger('NewSaleAdded', {
				key: saleKey,
				sale: receipt
			});
		});

		return true;
	};

	isPayoffOnly() {
		return this.props.products.length === 0;
	};
}

function mapStateToProps(state, props) {
	return {
		products: state.orderReducer.products,
		channel: state.orderReducer.channel,
		payment: state.orderReducer.payment,

		selectedCustomer: state.customerReducer.selectedCustomer};
}
function mapDispatchToProps(dispatch) {
	return {
		orderActions: bindActionCreators(OrderActions,dispatch),
		customerBarActions:bindActionCreators(CustomerBarActions, dispatch)
	};
}

export default  connect(mapStateToProps, mapDispatchToProps)(OrderPaymentScreen);

const styles = StyleSheet.create({
	orderPayment: {
		flex: 1,
		backgroundColor: "white",
		borderTopColor:'black',
		borderTopWidth:5
	},

	container: {
		flex: 1
	},

	checkBoxRow: {
		flex: 1,
		flexDirection:"row",
		marginTop:"1%",
		alignItems:'center'
	},
	checkBox: {
	},
	checkLabel: {
		left: 20,
		fontSize:20,
	},
	totalSubTotal: {
		flex: 1,
		flexDirection:"row"
	},
	totalTitle: {
		fontSize:20,
	},
	totalValue: {
		fontSize:20,
	},
	completeOrder: {
		backgroundColor:"#2858a7",
		borderRadius:30,
		marginTop:"1%"

	},
	buttonText:{
		fontWeight:'bold',
		fontSize:20,
		alignSelf:'center',
		color:'white'
	},
	cashInput : {
		textAlign: 'left',
		height: 50,
		width:100,
		borderWidth: 2,
		fontSize:20,
		borderColor: '#404040',
		// alignSelf: 'center',
	},
	orderProcessing: {
		height:100,
		width:500,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor:'#ABC1DE',
		borderColor:"#2858a7",
		borderWidth:5,
		borderRadius:10
	}

});

